import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "PostgreSQL stores an ordered tenant-safe message timeline with open opt-in",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;

    const [
      { eq, inArray },
      { db },
      { apiKeys, messages, orgMembers, orgs, users },
      { handleGetMessageRequest, handleListMessageEventsRequest },
      { messageApiServices },
      { listMessageEvents, recordMessageEvent },
      { queueEmail },
      { postgresWorkerStore },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/message-http.ts"),
      import("../src/lib/message-api-services.ts"),
      import("../src/lib/message-events.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/postgres-worker-store.ts"),
    ]);
    const orgId = randomUUID();
    const otherOrgId = randomUUID();
    const apiKeyId = randomUUID();
    const userId = `event-user-${randomUUID()}`;
    const integrationLock = await db.$client.connect();
    const principal = {
      actorUserId: userId,
      apiKeyId,
      environment: "test",
      orgId,
    };
    const payload = {
      from: "news@example.com",
      subject: "Timeline proof",
      text: "Private body",
      to: "reader@example.net",
    };

    await integrationLock.query("SELECT pg_advisory_lock($1)", [190019]);

    try {
      await db.insert(orgs).values([
        { id: orgId, name: "Message event integration" },
        { id: otherOrgId, name: "Other organization" },
      ]);
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Message event operator",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values([
        { orgId, role: "member", userId },
        { orgId: otherOrgId, role: "member", userId },
      ]);
      await db.insert(apiKeys).values({
        createdByUserId: userId,
        environment: "test",
        id: apiKeyId,
        keyHash: `hash-${randomUUID()}`,
        keyId: `key-${randomUUID()}`,
        name: "Message event test key",
        orgId,
      });

      const queued = await queueEmail({
        idempotencyKey: "message-event-proof",
        payload,
        principal,
      });
      const replayed = await queueEmail({
        idempotencyKey: "message-event-proof",
        payload,
        principal,
      });
      assert.equal(replayed.id, queued.id);
      assert.equal(replayed.replayed, true);

      let timeline = await listMessageEvents({
        actorUserId: userId,
        environment: "test",
        messageId: queued.id,
        orgId,
      });
      assert.deepEqual(timeline.map((event) => event.type), ["queued"]);
      assert.equal(timeline[0].createdAt.getTime(), queued.createdAt.getTime());

      const eventAt = queued.createdAt;
      const workerId = `event-worker-${randomUUID()}`;
      await db
        .update(messages)
        .set({
          attemptCount: 1,
          lastAttemptAt: eventAt,
          leaseExpiresAt: new Date(eventAt.getTime() + 300_000),
          status: "sending",
          updatedAt: eventAt,
          workerId,
        })
        .where(eq(messages.id, queued.id));

      assert.equal(
        await postgresWorkerStore.markSent({
          attemptCount: 2,
          messageId: queued.id,
          now: eventAt,
          workerId,
        }),
        false,
      );
      assert.equal(
        await postgresWorkerStore.markSent({
          attemptCount: 1,
          messageId: queued.id,
          now: eventAt,
          workerId,
        }),
        true,
      );

      await recordMessageEvent({
        createdAt: eventAt,
        data: { diagnostic: "safe" },
        messageId: queued.id,
        type: "bounced",
      });
      await recordMessageEvent({
        createdAt: eventAt,
        messageId: queued.id,
        type: "complained",
      });
      await assert.rejects(
        recordMessageEvent({
          createdAt: eventAt,
          messageId: queued.id,
          type: "opened",
        }),
        (error) => error?.code === "OPEN_TRACKING_DISABLED",
      );

      timeline = await listMessageEvents({
        actorUserId: userId,
        environment: "test",
        messageId: queued.id,
        orgId,
      });
      assert.deepEqual(timeline.map((event) => event.type), [
        "queued",
        "delivered",
        "bounced",
        "complained",
      ]);
      assert.equal(timeline.some((event) => event.type === "opened"), false);

      await db
        .update(messages)
        .set({ openTrackingEnabled: true })
        .where(eq(messages.id, queued.id));
      const firstOpen = await recordMessageEvent({
        createdAt: eventAt,
        messageId: queued.id,
        type: "opened",
      });
      const duplicateOpen = await recordMessageEvent({
        createdAt: new Date(eventAt.getTime() + 1_000),
        messageId: queued.id,
        type: "opened",
      });
      assert.equal(duplicateOpen.id, firstOpen.id);

      timeline = await listMessageEvents({
        actorUserId: userId,
        environment: "test",
        messageId: queued.id,
        orgId,
      });
      assert.deepEqual(timeline.map((event) => event.type), [
        "queued",
        "delivered",
        "bounced",
        "complained",
        "opened",
      ]);
      assert.equal(
        timeline.every(
          (event, index) => index === 0 || event.sequence > timeline[index - 1].sequence,
        ),
        true,
      );

      const dependencies = {
        authenticate: async () => principal,
        services: messageApiServices,
      };
      const detailResponse = await handleGetMessageRequest(
        new Request(`https://paperboy.test/api/v1/emails/${queued.id}`),
        queued.id,
        dependencies,
      );
      const eventsResponse = await handleListMessageEventsRequest(
        new Request(`https://paperboy.test/api/v1/emails/${queued.id}/events`),
        queued.id,
        dependencies,
      );
      const detail = await detailResponse.json();
      const eventBody = await eventsResponse.json();
      assert.equal(detailResponse.status, 200);
      assert.equal(detail.status, "sent");
      assert.equal(detail.open_tracking_enabled, true);
      assert.match(detail.created_at, /Z$/);
      assert.deepEqual(eventBody.data.map((event) => event.type), [
        "queued",
        "delivered",
        "bounced",
        "complained",
        "opened",
      ]);
      assert.equal(eventBody.data.every((event) => event.created_at.endsWith("Z")), true);

      for (const hiddenContext of [
        { environment: "live", orgId },
        { environment: "test", orgId: otherOrgId },
      ]) {
        await assert.rejects(
          listMessageEvents({
            actorUserId: userId,
            messageId: queued.id,
            ...hiddenContext,
          }),
          (error) => error?.code === "MESSAGE_NOT_FOUND",
        );
      }
    } finally {
      try {
        await db.delete(orgs).where(inArray(orgs.id, [orgId, otherOrgId]));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await integrationLock.query("SELECT pg_advisory_unlock($1)", [190019]);
        integrationLock.release();
        await db.$client.end();
      }
    }
  },
);
