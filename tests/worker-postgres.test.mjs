import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "PostgreSQL reclaims a message after a worker dies and stores terminal failure",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;

    const [
      { eq },
      { db },
      { messages, orgMembers, orgs, users },
      { getMessageDeliveryOverview },
      { postgresWorkerStore },
      { paperBoyMcpDeliveryServices },
      worker,
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/message-statuses.ts"),
      import("../src/lib/postgres-worker-store.ts"),
      import("../src/mcp/delivery-services.ts"),
      import("../src/lib/worker-core.ts"),
    ]);
    const orgId = randomUUID();
    const recoverableId = randomUUID();
    const failedId = randomUUID();
    const liveId = randomUUID();
    const userId = `worker-user-${randomUUID()}`;
    const integrationLock = await db.$client.reserve();

    await integrationLock`SELECT pg_advisory_lock(${190019})`;

    try {
      await db.insert(orgs).values({ id: orgId, name: "Worker integration" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Worker operator",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values({
        orgId,
        role: "member",
        userId,
      });
      await db.insert(messages).values([
        {
          deliveryMode: "test-sink",
          environment: "test",
          from: "news@example.com",
          id: recoverableId,
          orgId,
          subject: "Recoverable",
          textBody: "Private body",
          to: ["reader@example.net"],
        },
        {
          deliveryMode: "live",
          environment: "live",
          from: "news@example.com",
          id: liveId,
          orgId,
          outboundProvider: "smtp",
          subject: "Live queue isolation",
          textBody: "Private live body",
          to: ["live-reader@example.net"],
        },
      ]);

      const claimedAt = new Date(Date.now() + 1_000);
      const leaseExpiresAt = new Date(
        claimedAt.getTime() + worker.DELIVERY_LEASE_MS,
      );
      const firstClaim = await postgresWorkerStore.claim({
        deliveryModes: ["test-sink"],
        leaseExpiresAt,
        now: claimedAt,
        workerId: "shared-worker-id",
      });

      assert.equal(firstClaim.id, recoverableId);
      assert.equal(firstClaim.attemptCount, 1);
      const [leased] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, recoverableId));
      assert.equal(leased.status, "sending");
      assert.equal(leased.workerId, "shared-worker-id");

      const earlyClaim = await postgresWorkerStore.claim({
        deliveryModes: ["test-sink"],
        leaseExpiresAt: new Date(leaseExpiresAt.getTime() + 1_000),
        now: new Date(leaseExpiresAt.getTime() - 1),
        workerId: "shared-worker-id",
      });
      assert.equal(earlyClaim, null);

      const recoveredClaim = await postgresWorkerStore.claim({
        deliveryModes: ["test-sink"],
        leaseExpiresAt: new Date(
          leaseExpiresAt.getTime() + worker.DELIVERY_LEASE_MS,
        ),
        now: new Date(leaseExpiresAt.getTime() + 1),
        workerId: "shared-worker-id",
      });
      assert.equal(recoveredClaim.id, recoverableId);
      assert.equal(recoveredClaim.attemptCount, 2);
      assert.equal(
        await postgresWorkerStore.markSent({
          attemptCount: 1,
          messageId: recoverableId,
          now: new Date(leaseExpiresAt.getTime() + 2),
          providerMessageId: null,
          workerId: "shared-worker-id",
        }),
        false,
      );
      assert.equal(
        await postgresWorkerStore.markSent({
          attemptCount: 2,
          messageId: recoverableId,
          now: new Date(leaseExpiresAt.getTime() + 3),
          providerMessageId: "test-sink-proof",
          workerId: "shared-worker-id",
        }),
        true,
      );

      const [sent] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, recoverableId));
      assert.equal(sent.status, "sent");
      assert.equal(sent.attemptCount, 2);
      assert.equal(sent.workerId, null);
      assert.equal(sent.leaseExpiresAt, null);
      assert.ok(sent.sentAt instanceof Date);
      assert.equal(sent.providerMessageId, "test-sink-proof");

      await db.insert(messages).values({
        deliveryMode: "test-sink",
        environment: "test",
        from: "news@example.com",
        id: failedId,
        orgId,
        subject: "Permanent failure",
        textBody: "Private body",
        to: ["reader@example.net"],
      });
      const failureAt = new Date(leaseExpiresAt.getTime() + 4);
      const failedResult = await worker.processNextMessage({
        adapter: {
          name: "fake-mta",
          async send() {
            throw worker.smtpDeliveryError(550);
          },
        },
        deliveryModes: ["test-sink"],
        now: () => failureAt,
        store: postgresWorkerStore,
        workerId: "failure-worker",
      });

      assert.deepEqual(failedResult, { messageId: failedId, state: "failed" });
      const [failed] = await db
        .select()
        .from(messages)
        .where(eq(messages.id, failedId));
      assert.equal(failed.status, "failed");
      assert.equal(failed.attemptCount, 1);
      assert.equal(failed.lastErrorCode, "smtp_550");
      assert.equal(failed.failureReason, "SMTP server returned 550.");
      assert.ok(failed.failedAt instanceof Date);

      const overview = await getMessageDeliveryOverview({
        actorUserId: userId,
        orgId,
      });
      assert.deepEqual(overview.counts, {
        failed: 1,
        queued: 1,
        sending: 0,
        sent: 1,
      });
      assert.deepEqual(
        new Set(overview.messages.map((record) => record.id)),
        new Set([recoverableId, failedId, liveId]),
      );

      const principal = {
        actorUserId: userId,
        apiKeyId: randomUUID(),
        environment: "test",
        orgId,
      };
      const mcpRecord = await paperBoyMcpDeliveryServices.get(
        principal,
        failedId,
      );
      const mcpList = await paperBoyMcpDeliveryServices.list(principal, 10);
      assert.equal(mcpRecord.failureReason, "SMTP server returned 550.");
      assert.deepEqual(
        new Set(mcpList.map((record) => record.id)),
        new Set([recoverableId, failedId]),
      );
      assert.equal(mcpList.some((record) => record.id === liveId), false);
      assert.equal(
        JSON.stringify(mcpRecord).includes("reader@example.net"),
        false,
      );
      assert.equal(JSON.stringify(mcpRecord).includes("Private body"), false);
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await integrationLock`SELECT pg_advisory_unlock(${190019})`;
        integrationLock.release();
      }
    }
  },
);
