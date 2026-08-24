import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "parallel live and test sends share exact per-org PostgreSQL caps",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { and, eq },
      { db },
      {
        apiKeys,
        audiences,
        contacts,
        domainDkimKeys,
        domains,
        emailTemplates,
        messages,
        orgMembers,
        orgs,
        sendRateLimitWindows,
        users,
      },
      { generateApiKey },
      { createBroadcast },
      { queueEmail },
      { RateLimitError, RateLimitSettingsError },
      { getRateLimitSettings, updateRateLimitSettings },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/api-key-crypto.ts"),
      import("../src/lib/broadcasts.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/rate-limit-core.ts"),
      import("../src/lib/rate-limits.ts"),
    ]);
    const orgId = randomUUID();
    const userId = `rate-limit-admin-${randomUUID()}`;
    const fixedNow = new Date("2026-08-24T04:05:11.000Z");
    const liveKeys = [generateApiKey("live"), generateApiKey("live")];
    const testKey = generateApiKey("test");
    const liveKeyIds = [randomUUID(), randomUUID()];
    const testKeyId = randomUUID();
    const lock = await db.$client.reserve();

    await lock`SELECT pg_advisory_lock(${190024})`;
    try {
      await db.insert(orgs).values({ id: orgId, name: "Rate-limit tenant" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Rate limit admin",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values({
        orgId,
        role: "admin",
        userId,
      });
      await db.insert(apiKeys).values([
        ...liveKeys.map((key, index) => ({
          createdByUserId: userId,
          environment: "live",
          id: liveKeyIds[index],
          keyHash: key.keyHash,
          keyId: key.keyId,
          name: `Live ${index + 1}`,
          orgId,
        })),
        {
          createdByUserId: userId,
          environment: "test",
          id: testKeyId,
          keyHash: testKey.keyHash,
          keyId: testKey.keyId,
          name: "Test",
          orgId,
        },
      ]);
      const [domain] = await db
        .insert(domains)
        .values({
          id: randomUUID(),
          name: "limits.example",
          orgId,
          status: "verified",
          verifiedAt: fixedNow,
        })
        .returning({ id: domains.id });
      await db.insert(domainDkimKeys).values({
        activatedAt: fixedNow,
        dnsStatus: "matched",
        domainId: domain.id,
        encryptedPrivateKey: "integration-only",
        publicKey: "integration-only",
        selector: "pb-rate-limit-test",
        status: "active",
      });

      const configured = await updateRateLimitSettings({
        actorUserId: userId,
        now: fixedNow,
        orgId,
        payload: {
          live_limit_per_minute: 5,
          test_limit_per_minute: 10,
        },
      });
      assert.equal(configured.liveLimitPerMinute, 5);
      assert.equal(configured.testLimitPerMinute, 10);
      assert.equal(
        (await getRateLimitSettings({ actorUserId: userId, orgId })).updatedAt.toISOString(),
        fixedNow.toISOString(),
      );
      await assert.rejects(
        () =>
          updateRateLimitSettings({
            actorUserId: userId,
            orgId,
            payload: {
              live_limit_per_minute: 10,
              test_limit_per_minute: 10,
            },
          }),
        (error) =>
          error instanceof RateLimitSettingsError &&
          error.code === "VALIDATION_ERROR",
      );

      const livePayload = (index) => ({
        from: "PaperBoy <news@limits.example>",
        subject: `Live parallel ${index}`,
        text: "Rate-limit acceptance proof.",
        to: `reader-${index}@example.net`,
      });
      const liveResults = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) =>
          queueEmail({
            idempotencyKey: `live-parallel-${index}`,
            payload: livePayload(index),
            principal: {
              actorUserId: userId,
              apiKeyId: liveKeyIds[index % liveKeyIds.length],
              environment: "live",
              orgId,
            },
            rateLimitNow: fixedNow,
          }),
        ),
      );
      const liveAccepted = liveResults.filter(
        (result) => result.status === "fulfilled",
      );
      const liveRejected = liveResults.filter(
        (result) => result.status === "rejected",
      );
      assert.equal(liveAccepted.length, 5);
      assert.equal(liveRejected.length, 7);
      assert.equal(
        liveRejected.every(
          (result) =>
            result.reason instanceof RateLimitError &&
            result.reason.environment === "live" &&
            result.reason.limit === 5 &&
            result.reason.retryAfterSeconds === 49,
        ),
        true,
      );

      const replayIndex = liveResults.findIndex(
        (result) => result.status === "fulfilled",
      );
      const replay = await queueEmail({
        idempotencyKey: `live-parallel-${replayIndex}`,
        payload: livePayload(replayIndex),
        principal: {
          actorUserId: userId,
          apiKeyId: liveKeyIds[replayIndex % liveKeyIds.length],
          environment: "live",
          orgId,
        },
        rateLimitNow: fixedNow,
      });
      assert.equal(replay.replayed, true);

      const [audience] = await db
        .insert(audiences)
        .values({ name: "Capped broadcast", orgId })
        .returning({ id: audiences.id });
      await db.insert(contacts).values({
        audienceId: audience.id,
        email: "broadcast-reader@example.net",
        name: "Broadcast reader",
      });
      const [template] = await db
        .insert(emailTemplates)
        .values({
          name: "Capped broadcast",
          orgId,
          requiredVariables: ["name"],
          subject: "Hello {{name}}",
          textBody: "Body for {{name}}",
        })
        .returning({ id: emailTemplates.id });
      const cappedBroadcast = await createBroadcast(
        {
          payload: {
            audience_id: audience.id,
            from: "news@limits.example",
            name: "Capped broadcast",
            template_id: template.id,
          },
          principal: {
            actorUserId: userId,
            apiKeyId: liveKeyIds[0],
            environment: "live",
            orgId,
          },
        },
        {
          now: () => fixedNow,
          queue: (input) => queueEmail({ ...input, rateLimitNow: fixedNow }),
          unsubscribeUrl: () => "https://paperboy.example/unsubscribe?token=test",
        },
      );
      assert.equal(cappedBroadcast.status, "paused");
      assert.equal(cappedBroadcast.progress.pending, 1);
      assert.equal(cappedBroadcast.progress.failed, 0);
      assert.equal(cappedBroadcast.progress.queued, 0);

      const testResults = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) =>
          queueEmail({
            payload: {
              from: "sandbox@example.com",
              subject: `Test parallel ${index}`,
              text: "Separate higher test window.",
              to: `sandbox-${index}@example.net`,
            },
            principal: {
              actorUserId: userId,
              apiKeyId: testKeyId,
              environment: "test",
              orgId,
            },
            rateLimitNow: fixedNow,
          }),
        ),
      );
      assert.equal(
        testResults.filter((result) => result.status === "fulfilled").length,
        10,
      );
      assert.equal(
        testResults.filter((result) => result.status === "rejected").length,
        2,
      );

      const stored = await db
        .select({
          deliveryMode: messages.deliveryMode,
          environment: messages.environment,
        })
        .from(messages)
        .where(eq(messages.orgId, orgId));
      assert.equal(
        stored.filter((message) => message.environment === "live").length,
        5,
      );
      assert.equal(
        stored.filter((message) => message.environment === "test").length,
        10,
      );
      assert.equal(
        stored.filter(
          (message) =>
            message.environment === "live" && message.deliveryMode === "live",
        ).length,
        5,
      );
      const counters = await db
        .select({
          acceptedCount: sendRateLimitWindows.acceptedCount,
          environment: sendRateLimitWindows.environment,
        })
        .from(sendRateLimitWindows)
        .where(eq(sendRateLimitWindows.orgId, orgId));
      assert.deepEqual(
        counters
          .map((counter) => [counter.environment, counter.acceptedCount])
          .sort(),
        [
          ["live", 5],
          ["test", 10],
        ],
      );
      assert.equal(
        (
          await db
            .select()
            .from(messages)
            .where(
              and(
                eq(messages.orgId, orgId),
                eq(messages.environment, "live"),
              ),
            )
        ).length,
        5,
      );
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await lock`SELECT pg_advisory_unlock(${190024})`;
        lock.release();
      }
    }
  },
);
