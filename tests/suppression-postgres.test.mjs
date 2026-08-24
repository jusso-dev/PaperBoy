import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "PostgreSQL suppression CRUD and CSV stay tenant-bound before provider queueing",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { count, eq },
      { db },
      { apiKeys, emailSuppressions, messages, orgMembers, orgs, users },
      { AuthorizationError },
      { generateApiKey },
      { EmailError },
      { queueEmail },
      { SuppressionError },
      {
        createSuppression,
        deleteSuppression,
        getSuppression,
        importSuppressions,
        listSuppressions,
        updateSuppression,
      },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/authorization.ts"),
      import("../src/lib/api-key-crypto.ts"),
      import("../src/lib/email-core.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/suppression-core.ts"),
      import("../src/lib/suppressions.ts"),
    ]);
    const firstOrgId = randomUUID();
    const secondOrgId = randomUUID();
    const apiKeyId = randomUUID();
    const adminId = `suppression-admin-${randomUUID()}`;
    const memberId = `suppression-member-${randomUUID()}`;
    const generatedKey = generateApiKey("test");
    const lock = await db.$client.reserve();
    const principal = {
      actorUserId: adminId,
      apiKeyId,
      environment: "test",
      orgId: firstOrgId,
    };

    await lock`SELECT pg_advisory_lock(${190022})`;

    try {
      await db.insert(orgs).values([
        { id: firstOrgId, name: "First suppression tenant" },
        { id: secondOrgId, name: "Second suppression tenant" },
      ]);
      await db.insert(users).values([
        {
          email: `${randomUUID()}@example.com`,
          id: adminId,
          name: "Suppression admin",
          timezone: "Australia/Sydney",
        },
        {
          email: `${randomUUID()}@example.com`,
          id: memberId,
          name: "Suppression reader",
          timezone: "Pacific/Auckland",
        },
      ]);
      await db.insert(orgMembers).values([
        { orgId: firstOrgId, role: "admin", userId: adminId },
        { orgId: secondOrgId, role: "admin", userId: adminId },
        { orgId: firstOrgId, role: "member", userId: memberId },
      ]);
      await db.insert(apiKeys).values({
        createdByUserId: adminId,
        environment: "test",
        id: apiKeyId,
        keyHash: generatedKey.keyHash,
        keyId: generatedKey.keyId,
        name: "Suppression integration",
        orgId: firstOrgId,
      });

      const created = await createSuppression({
        actorUserId: adminId,
        now: new Date("2026-08-24T04:00:00.000Z"),
        orgId: firstOrgId,
        payload: { email: "Blocked@Example.NET", reason: "manual" },
      });
      assert.equal(created.email, "blocked@example.net");
      assert.equal(created.reason, "manual");
      assert.equal(created.updatedAt.toISOString(), "2026-08-24T04:00:00.000Z");

      await assert.rejects(
        () =>
          createSuppression({
            actorUserId: adminId,
            orgId: firstOrgId,
            payload: { email: "blocked@example.net" },
          }),
        (error) =>
          error instanceof SuppressionError &&
          error.code === "SUPPRESSION_EXISTS",
      );
      const memberList = await listSuppressions({
        actorUserId: memberId,
        orgId: firstOrgId,
      });
      assert.deepEqual(memberList.map((row) => row.id), [created.id]);
      await assert.rejects(
        () =>
          createSuppression({
            actorUserId: memberId,
            orgId: firstOrgId,
            payload: { email: "member-change@example.net" },
          }),
        AuthorizationError,
      );
      await assert.rejects(
        () =>
          getSuppression({
            actorUserId: adminId,
            orgId: secondOrgId,
            suppressionId: created.id,
          }),
        (error) =>
          error instanceof SuppressionError &&
          error.code === "SUPPRESSION_NOT_FOUND",
      );

      const updated = await updateSuppression({
        actorUserId: adminId,
        now: new Date("2026-08-24T04:01:00.000Z"),
        orgId: firstOrgId,
        payload: { reason: "bounced" },
        suppressionId: created.id,
      });
      assert.equal(updated.reason, "bounced");
      assert.equal(updated.updatedAt.toISOString(), "2026-08-24T04:01:00.000Z");

      const csv = [
        "email,reason",
        "blocked@example.net,manual",
        "blocked@example.net,complained",
        "imported@example.net,manual",
        "imported@example.net,bounced",
        "",
      ].join("\n");
      const imported = await importSuppressions({
        actorUserId: adminId,
        csv,
        now: new Date("2026-08-24T04:02:00.000Z"),
        orgId: firstOrgId,
      });
      assert.deepEqual(imported, {
        created: 1,
        importedAt: new Date("2026-08-24T04:02:00.000Z"),
        inputRows: 4,
        unchanged: 0,
        uniqueRows: 2,
        updated: 1,
      });
      const replay = await importSuppressions({
        actorUserId: adminId,
        csv,
        now: new Date("2026-08-24T04:03:00.000Z"),
        orgId: firstOrgId,
      });
      assert.equal(replay.created, 0);
      assert.equal(replay.updated, 0);
      assert.equal(replay.unchanged, 2);
      const filtered = await listSuppressions({
        actorUserId: adminId,
        filter: { query: "BLOCKED", reason: "complained" },
        orgId: firstOrgId,
      });
      assert.deepEqual(filtered.map((row) => [row.email, row.reason]), [
        ["blocked@example.net", "complained"],
      ]);

      await assert.rejects(
        () =>
          importSuppressions({
            actorUserId: adminId,
            csv: "email\nwould-import@example.net\nnot an address\n",
            orgId: firstOrgId,
          }),
        (error) =>
          error instanceof SuppressionError &&
          error.code === "VALIDATION_ERROR",
      );
      assert.equal(
        (
          await db
            .select({ value: count() })
            .from(emailSuppressions)
            .where(eq(emailSuppressions.orgId, firstOrgId))
        )[0].value,
        2,
      );

      await assert.rejects(
        () =>
          queueEmail({
            payload: {
              from: "sender@example.com",
              subject: "Must stop before Cloudflare or SMTP",
              text: "This must not create a provider queue row.",
              to: "blocked@example.net",
            },
            principal,
          }),
        (error) =>
          error instanceof EmailError &&
          error.code === "RECIPIENT_SUPPRESSED" &&
          error.issues[0].message.includes("complaint"),
      );
      assert.equal(
        (
          await db
            .select({ value: count() })
            .from(messages)
            .where(eq(messages.orgId, firstOrgId))
        )[0].value,
        0,
      );

      await deleteSuppression({
        actorUserId: adminId,
        orgId: firstOrgId,
        suppressionId: created.id,
      });
      const queued = await queueEmail({
        payload: {
          from: "sender@example.com",
          subject: "Allowed only after explicit removal",
          text: "Queued, but no adapter is invoked by this test.",
          to: "blocked@example.net",
        },
        principal,
      });
      assert.equal(queued.status, "queued");

      const otherTenant = await createSuppression({
        actorUserId: adminId,
        orgId: secondOrgId,
        payload: { email: "blocked@example.net", reason: "manual" },
      });
      assert.equal(otherTenant.email, "blocked@example.net");
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, firstOrgId));
        await db.delete(orgs).where(eq(orgs.id, secondOrgId));
        await db.delete(users).where(eq(users.id, adminId));
        await db.delete(users).where(eq(users.id, memberId));
      } finally {
        await lock`SELECT pg_advisory_unlock(${190022})`;
        lock.release();
      }
    }
  },
);
