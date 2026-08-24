import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "PostgreSQL audiences unsubscribe atomically before SMTP or Cloudflare queueing",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { and, eq },
      { db },
      {
        apiKeys,
        audiences,
        broadcastRecipients,
        contacts,
        emailSuppressions,
        emailTemplates,
        messages,
        orgMembers,
        orgs,
        users,
      },
      { AudienceError },
      {
        createAudience,
        createContact,
        getAudience,
        importContacts,
        listAudiences,
        listContacts,
      },
      { generateApiKey },
      { createBroadcast, getBroadcast, processNextScheduledBroadcast },
      { prepareCloudflareEmailMessage },
      { EmailError },
      { queueEmail },
      { unsubscribe, UnsubscribeError },
      { createUnsubscribeToken, createUnsubscribeUrl },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/audience-core.ts"),
      import("../src/lib/audiences.ts"),
      import("../src/lib/api-key-crypto.ts"),
      import("../src/lib/broadcasts.ts"),
      import("../src/lib/email-delivery.ts"),
      import("../src/lib/email-core.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/unsubscribe.ts"),
      import("../src/lib/unsubscribe-core.ts"),
    ]);
    const firstOrgId = randomUUID();
    const secondOrgId = randomUUID();
    const adminId = `audience-admin-${randomUUID()}`;
    const memberId = `audience-member-${randomUUID()}`;
    const apiKeyId = randomUUID();
    const generatedKey = generateApiKey("test");
    const signingKey = Buffer.alloc(32, 23);
    const fixedNow = new Date("2026-08-24T09:10:11.123Z");
    const lock = await db.$client.reserve();
    const principal = {
      actorUserId: adminId,
      apiKeyId,
      environment: "test",
      orgId: firstOrgId,
    };

    await lock`SELECT pg_advisory_lock(${190023})`;
    try {
      await db.insert(orgs).values([
        { id: firstOrgId, name: "First audience tenant" },
        { id: secondOrgId, name: "Second audience tenant" },
      ]);
      await db.insert(users).values([
        {
          email: `${randomUUID()}@example.com`,
          id: adminId,
          name: "Audience admin",
          timezone: "Australia/Sydney",
        },
        {
          email: `${randomUUID()}@example.com`,
          id: memberId,
          name: "Audience reader",
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
        name: "Audience integration",
        orgId: firstOrgId,
      });

      const weekly = await createAudience({
        actorUserId: adminId,
        now: fixedNow,
        orgId: firstOrgId,
        payload: { name: "Weekly readers" },
      });
      const product = await createAudience({
        actorUserId: adminId,
        now: fixedNow,
        orgId: firstOrgId,
        payload: { name: "Product readers" },
      });
      const otherTenant = await createAudience({
        actorUserId: adminId,
        now: fixedNow,
        orgId: secondOrgId,
        payload: { name: "Weekly readers" },
      });
      assert.equal(otherTenant.name, weekly.name);
      await assert.rejects(
        () => createAudience({
          actorUserId: adminId,
          orgId: firstOrgId,
          payload: { name: "weekly READERS" },
        }),
        (error) => error instanceof AudienceError && error.code === "AUDIENCE_EXISTS",
      );

      const reader = await createContact({
        actorUserId: adminId,
        audienceId: weekly.id,
        now: fixedNow,
        orgId: firstOrgId,
        payload: { email: "Reader@Example.NET", name: "Ada" },
      });
      const duplicateAudienceContact = await createContact({
        actorUserId: adminId,
        audienceId: product.id,
        now: fixedNow,
        orgId: firstOrgId,
        payload: { email: reader.email, name: "Ada duplicate" },
      });
      const imported = await importContacts({
        actorUserId: adminId,
        audienceId: weekly.id,
        csv: "email,name\nreader@example.net,Ada Lovelace\nactive@example.net,Grace\nactive@example.net,Grace Hopper\n",
        now: new Date("2026-08-24T09:11:00.000Z"),
        orgId: firstOrgId,
      });
      assert.deepEqual(imported, {
        created: 1,
        importedAt: new Date("2026-08-24T09:11:00.000Z"),
        inputRows: 3,
        unchanged: 0,
        uniqueRows: 2,
        updated: 1,
      });
      const replay = await importContacts({
        actorUserId: adminId,
        audienceId: weekly.id,
        csv: "email,name\nreader@example.net,Ada Lovelace\nactive@example.net,Grace Hopper\n",
        orgId: firstOrgId,
      });
      assert.equal(replay.created, 0);
      assert.equal(replay.updated, 0);
      assert.equal(replay.unchanged, 2);
      assert.equal((await getAudience({ actorUserId: memberId, audienceId: weekly.id, orgId: firstOrgId })).contactCount, 2);
      assert.equal((await listAudiences({ actorUserId: memberId, orgId: firstOrgId })).length, 2);
      await assert.rejects(
        () => getAudience({ actorUserId: adminId, audienceId: weekly.id, orgId: secondOrgId }),
        (error) => error instanceof AudienceError && error.code === "AUDIENCE_NOT_FOUND",
      );

      const token = createUnsubscribeToken({ contactId: reader.id, key: signingKey });
      const signatureCharacter = token.at(-1);
      await assert.rejects(
        () => unsubscribe({
          key: signingKey,
          token: `${token.slice(0, -1)}${signatureCharacter === "A" ? "B" : "A"}`,
        }),
        UnsubscribeError,
      );
      assert.equal(
        (await listContacts({ actorUserId: adminId, audienceId: weekly.id, orgId: firstOrgId }))[0].unsubscribedAt,
        null,
      );

      const unsubscribed = await unsubscribe({ key: signingKey, now: fixedNow, token });
      assert.deepEqual(unsubscribed, { replayed: false, unsubscribedAt: fixedNow });
      const repeated = await unsubscribe({ key: signingKey, now: new Date("2026-08-24T10:00:00.000Z"), token });
      assert.equal(repeated.replayed, true);
      assert.equal(repeated.unsubscribedAt.toISOString(), fixedNow.toISOString());
      const storedContacts = await db
        .select({ id: contacts.id, unsubscribedAt: contacts.unsubscribedAt })
        .from(contacts)
        .where(eq(contacts.email, reader.email));
      assert.deepEqual(
        storedContacts.map((row) => row.id).sort(),
        [reader.id, duplicateAudienceContact.id].sort(),
      );
      assert.equal(storedContacts.every((row) => row.unsubscribedAt?.toISOString() === fixedNow.toISOString()), true);
      const [suppression] = await db
        .select({ reason: emailSuppressions.reason })
        .from(emailSuppressions)
        .where(and(eq(emailSuppressions.orgId, firstOrgId), eq(emailSuppressions.email, reader.email)));
      assert.equal(suppression.reason, "unsubscribed");

      await assert.rejects(
        () => queueEmail({
          payload: {
            from: "sender@example.com",
            subject: "Must stop before Cloudflare or SMTP",
            text: "No provider queue row may be inserted.",
            to: reader.email,
          },
          principal,
        }),
        (error) => error instanceof EmailError && error.code === "RECIPIENT_SUPPRESSED" && error.issues[0].message.includes("unsubscribed"),
      );
      assert.equal((await db.select().from(messages).where(eq(messages.orgId, firstOrgId))).length, 0);

      const templateId = randomUUID();
      await db.insert(emailTemplates).values({
        id: templateId,
        name: "Audience welcome",
        orgId: firstOrgId,
        requiredVariables: ["name"],
        subject: "Hello {{name}}",
        textBody: "Welcome {{name}}",
      });
      const queued = [];
      let queueError = null;
      const broadcast = await createBroadcast(
        {
          payload: {
            audience_id: weekly.id,
            from: "news@example.com",
            name: "Weekly issue",
            template_id: templateId,
          },
          principal,
        },
        {
          now: () => fixedNow,
          queue: async (input) => {
            queued.push(input);
            try {
              return await queueEmail(input);
            } catch (error) {
              queueError = error;
              throw error;
            }
          },
          unsubscribeUrl: (contactId) => createUnsubscribeUrl({
            baseUrl: "https://paperboy.example",
            contactId,
            key: signingKey,
          }),
        },
      );
      assert.equal(broadcast.sourceAudienceId, weekly.id);
      assert.equal(broadcast.progress.total, 1);
      assert.equal(
        broadcast.progress.queued,
        1,
        JSON.stringify({
          progress: broadcast.progress,
          queueCalls: queued.length,
          queueError: queueError
            ? {
                code: queueError.code,
                issues: queueError.issues,
                message: queueError.message,
                name: queueError.name,
              }
            : null,
        }),
      );
      assert.equal(queued.length, 1);
      assert.deepEqual(queued[0].payload.to, ["active@example.net"]);
      assert.match(queued[0].payload.text, /Welcome Grace Hopper/);
      assert.match(queued[0].payload.text, /https:\/\/paperboy\.example\/unsubscribe\?token=/);
      const cloudflare = prepareCloudflareEmailMessage({
        attachments: [],
        from: queued[0].payload.from,
        html: queued[0].payload.html ?? null,
        subject: queued[0].payload.subject,
        text: queued[0].payload.text ?? null,
        to: queued[0].payload.to,
      });
      assert.match(cloudflare.text, /Unsubscribe:/);
      assert.equal("date" in cloudflare, false);
      assert.equal("dkim" in cloudflare, false);
      const [snapshot] = await db
        .select({ contactId: broadcastRecipients.contactId, data: broadcastRecipients.data })
        .from(broadcastRecipients)
        .where(eq(broadcastRecipients.broadcastId, broadcast.id));
      assert.equal(snapshot.contactId !== null, true);
      assert.equal(snapshot.data.name, "Grace Hopper");
      assert.match(snapshot.data.unsubscribe_url, /^https:\/\/paperboy\.example\/unsubscribe\?token=/);

      const scheduledFor = new Date(fixedNow.getTime() + 60_000);
      const scheduled = await createBroadcast(
        {
          payload: {
            audience_id: weekly.id,
            from: "news@example.com",
            name: "Scheduled issue",
            scheduled_for: scheduledFor.toISOString(),
            template_id: templateId,
          },
          principal,
        },
        {
          now: () => fixedNow,
          queue: queueEmail,
          unsubscribeUrl: (contactId) => createUnsubscribeUrl({
            baseUrl: "https://paperboy.example",
            contactId,
            key: signingKey,
          }),
        },
      );
      assert.equal(scheduled.status, "scheduled");
      assert.equal(scheduled.scheduledFor?.toISOString(), scheduledFor.toISOString());
      assert.equal(scheduled.progress.pending, 1);

      assert.equal(
        await processNextScheduledBroadcast({
          now: () => new Date(scheduledFor.getTime() + 1_000),
          queue: queueEmail,
        }),
        true,
      );
      const completedScheduled = await getBroadcast({
        actorUserId: adminId,
        broadcastId: scheduled.id,
        orgId: firstOrgId,
      });
      assert.equal(completedScheduled.status, "completed");
      assert.equal(completedScheduled.progress.queued, 1);
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, firstOrgId));
        await db.delete(orgs).where(eq(orgs.id, secondOrgId));
        await db.delete(users).where(eq(users.id, adminId));
        await db.delete(users).where(eq(users.id, memberId));
      } finally {
        await lock`SELECT pg_advisory_unlock(${190023})`;
        lock.release();
      }
    }
  },
);
