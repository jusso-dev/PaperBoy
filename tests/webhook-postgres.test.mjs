import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "PostgreSQL fans message events into signed retrying webhook deliveries",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;

    const [
      { eq },
      { db },
      {
        apiKeys,
        messages,
        orgMembers,
        orgs,
        users,
        webhookDeliveries,
        webhookEndpoints,
      },
      { queueEmail },
      { postgresWorkerStore },
      { postgresWebhookStore },
      { verifyWebhookSignature },
      { processNextWebhook },
      { configureWebhookEndpoint, getWebhookEndpoint },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/postgres-worker-store.ts"),
      import("../src/lib/postgres-webhook-store.ts"),
      import("../src/lib/webhook-core.ts"),
      import("../src/lib/webhook-worker-core.ts"),
      import("../src/lib/webhooks.ts"),
    ]);
    const orgId = randomUUID();
    const apiKeyId = randomUUID();
    const userId = `webhook-user-${randomUUID()}`;
    const encryptionKey = Buffer.alloc(32, 11);
    const received = [];
    const responseStatuses = [503, 204, 204];
    let signingSecret;
    const server = createServer((request, response) => {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        const timestamp = request.headers["webhook-timestamp"];
        received.push({
          body,
          id: request.headers["webhook-id"],
          path: request.url,
          verified: verifyWebhookSignature({
            body,
            headers: {
              "webhook-id": request.headers["webhook-id"],
              "webhook-signature": request.headers["webhook-signature"],
              "webhook-timestamp": timestamp,
            },
            now: new Date(Number(timestamp) * 1000),
            secret: signingSecret,
          }),
        });
        response.statusCode = responseStatuses.shift() ?? 500;
        response.end();
      });
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.equal(typeof address, "object");
    const endpointUrl = `http://127.0.0.1:${address.port}/paperboy-events`;
    const integrationLock = await db.$client.reserve();

    await integrationLock`SELECT pg_advisory_lock(${190019})`;

    try {
      await db.insert(orgs).values({ id: orgId, name: "Webhook integration" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Webhook operator",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values({
        orgId,
        role: "admin",
        userId,
      });
      await db.insert(apiKeys).values({
        createdByUserId: userId,
        environment: "test",
        id: apiKeyId,
        keyHash: `hash-${randomUUID()}`,
        keyId: `key-${randomUUID()}`,
        name: "Webhook test key",
        orgId,
      });

      const configured = await configureWebhookEndpoint({
        actorUserId: userId,
        allowInsecureLoopback: true,
        encryptionKey,
        now: new Date("2026-08-24T01:00:00.000Z"),
        orgId,
        payload: { url: endpointUrl },
      });
      signingSecret = configured.signingSecret;
      assert.match(signingSecret, /^whsec_/);
      const reconfigured = await configureWebhookEndpoint({
        actorUserId: userId,
        allowInsecureLoopback: true,
        encryptionKey,
        now: new Date("2026-08-24T01:00:01.000Z"),
        orgId,
        payload: { url: endpointUrl },
      });
      assert.equal(reconfigured.endpoint.id, configured.endpoint.id);
      assert.equal(reconfigured.signingSecret, null);
      assert.deepEqual(await getWebhookEndpoint({ actorUserId: userId, orgId }), {
        ...reconfigured.endpoint,
      });

      const [storedEndpoint] = await db
        .select()
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.orgId, orgId));
      assert.equal(storedEndpoint.encryptedSecret.includes(signingSecret), false);

      const principal = {
        actorUserId: userId,
        apiKeyId,
        environment: "test",
        orgId,
      };
      const queued = await queueEmail({
        idempotencyKey: "signed-webhook-proof",
        payload: {
          from: "news@example.com",
          subject: "Private subject",
          text: "Private body",
          to: "reader@example.net",
        },
        principal,
      });
      const replayed = await queueEmail({
        idempotencyKey: "signed-webhook-proof",
        payload: {
          from: "news@example.com",
          subject: "Private subject",
          text: "Private body",
          to: "reader@example.net",
        },
        principal,
      });
      assert.equal(replayed.replayed, true);
      assert.equal(replayed.id, queued.id);

      let deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.orgId, orgId));
      assert.equal(deliveries.length, 1);
      assert.equal(deliveries[0].body.includes("reader@example.net"), false);
      assert.equal(deliveries[0].body.includes("Private"), false);
      assert.equal(deliveries[0].encryptedSecret.includes(signingSecret), false);
      assert.equal(JSON.parse(deliveries[0].body).type, "email.queued");

      const firstAttemptAt = new Date(queued.createdAt.getTime() + 1_000);
      const retried = await processNextWebhook({
        encryptionKey,
        now: () => firstAttemptAt,
        store: postgresWebhookStore,
        workerId: "webhook-integration",
      });
      assert.equal(retried.state, "retry");
      const secondAttemptAt = new Date(firstAttemptAt.getTime() + 60_000);
      const delivered = await processNextWebhook({
        encryptionKey,
        now: () => secondAttemptAt,
        store: postgresWebhookStore,
        workerId: "webhook-integration",
      });
      assert.equal(delivered.state, "delivered");

      const eventAt = new Date(secondAttemptAt.getTime() + 1_000);
      const messageWorkerId = `message-worker-${randomUUID()}`;
      await db
        .update(messages)
        .set({
          attemptCount: 1,
          lastAttemptAt: eventAt,
          leaseExpiresAt: new Date(eventAt.getTime() + 300_000),
          status: "sending",
          updatedAt: eventAt,
          workerId: messageWorkerId,
        })
        .where(eq(messages.id, queued.id));
      assert.equal(
        await postgresWorkerStore.markSent({
          attemptCount: 1,
          messageId: queued.id,
          now: eventAt,
          workerId: messageWorkerId,
        }),
        true,
      );

      deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.orgId, orgId));
      assert.equal(deliveries.length, 2);
      assert.deepEqual(
        deliveries.map((delivery) => JSON.parse(delivery.body).type).sort(),
        ["email.delivered", "email.queued"],
      );
      const deliveredEvent = await processNextWebhook({
        encryptionKey,
        now: () => new Date(eventAt.getTime() + 1_000),
        store: postgresWebhookStore,
        workerId: "webhook-integration",
      });
      assert.equal(deliveredEvent.state, "delivered");

      deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.orgId, orgId));
      assert.deepEqual(
        deliveries.map((delivery) => [
          JSON.parse(delivery.body).type,
          delivery.status,
          delivery.attemptCount,
        ]).sort(),
        [
          ["email.delivered", "delivered", 1],
          ["email.queued", "delivered", 2],
        ],
      );
      assert.equal(received.length, 3);
      assert.equal(received.every((request) => request.verified), true);
      assert.equal(received.every((request) => request.path === "/paperboy-events"), true);
      assert.equal(received[0].id, received[1].id);
      assert.notEqual(received[1].id, received[2].id);
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await integrationLock`SELECT pg_advisory_unlock(${190019})`;
        integrationLock.release();
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    }
  },
);
