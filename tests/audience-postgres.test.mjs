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
        broadcasts,
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
        deleteUnsubscribedContacts,
        getAudience,
        importContacts,
        listAudiences,
        listContacts,
      },
      { generateApiKey },
      {
        createBroadcast,
        getBroadcast,
        listBroadcasts,
        processNextScheduledBroadcast,
        updateScheduledBroadcast,
      },
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
      const uncapped = await createAudience({
        actorUserId: adminId,
        orgId: firstOrgId,
        payload: { name: "Uncapped readers" },
      });
      const uncappedRows = Array.from(
        { length: 125 },
        (_, index) => `reader-${index}@uncapped.example`,
      );
      const uncappedImport = await importContacts({
        actorUserId: adminId,
        audienceId: uncapped.id,
        csv: `email\n${uncappedRows.join("\n")}`,
        orgId: firstOrgId,
      });
      assert.equal(uncappedImport.created, 125);
      assert.equal(
        (await getAudience({ actorUserId: adminId, audienceId: uncapped.id, orgId: firstOrgId })).contactCount,
        125,
      );
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
      const bulkDeleted = await deleteUnsubscribedContacts({
        actorUserId: adminId,
        audienceId: weekly.id,
        orgId: firstOrgId,
      });
      assert.deepEqual(bulkDeleted, { deleted: 1 });
      assert.deepEqual(
        (await listContacts({ actorUserId: adminId, audienceId: weekly.id, orgId: firstOrgId }))
          .map((contact) => contact.email),
        ["active@example.net"],
      );
      assert.equal(
        (await listContacts({ actorUserId: adminId, audienceId: product.id, orgId: firstOrgId }))[0]
          .unsubscribedAt?.toISOString(),
        fixedNow.toISOString(),
      );
      const [retainedSuppression] = await db
        .select({ reason: emailSuppressions.reason })
        .from(emailSuppressions)
        .where(and(eq(emailSuppressions.orgId, firstOrgId), eq(emailSuppressions.email, reader.email)));
      assert.equal(retainedSuppression.reason, "unsubscribed");

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

      const unrestrictedSchedule = new Date("2028-01-15T04:00:00.000Z");
      const unrestricted = await createBroadcast(
        {
          payload: {
            audience_id: weekly.id,
            from: "news@example.com",
            name: "Unrestricted scheduled issue",
            scheduled_for: unrestrictedSchedule.toISOString(),
            template_id: templateId,
          },
          principal,
        },
        {
          now: () => fixedNow,
          unsubscribeUrl: (contactId) => createUnsubscribeUrl({
            baseUrl: "https://paperboy.example",
            contactId,
            key: signingKey,
          }),
        },
      );
      assert.equal(unrestricted.progress.total, 1);
      const movedSchedule = new Date("2029-02-20T03:30:00.000Z");
      const updatedUnrestricted = await updateScheduledBroadcast(
        {
          actorUserId: adminId,
          broadcastId: unrestricted.id,
          orgId: firstOrgId,
          payload: {
            audience_id: uncapped.id,
            html: "<p>Updated letter body</p>",
            name: "All readers",
            scheduled_for: movedSchedule.toISOString(),
            subject: "All readers update",
          },
        },
        {
          now: () => fixedNow,
          unsubscribeUrl: (contactId) => createUnsubscribeUrl({
            baseUrl: "https://paperboy.example",
            contactId,
            key: signingKey,
          }),
        },
      );
      assert.equal(updatedUnrestricted.name, "All readers");
      assert.equal(updatedUnrestricted.progress.total, 125);
      assert.equal(updatedUnrestricted.progress.pending, 125);
      assert.equal(updatedUnrestricted.scheduledFor?.toISOString(), movedSchedule.toISOString());
      assert.equal(updatedUnrestricted.sourceAudienceId, uncapped.id);
      assert.equal(updatedUnrestricted.templateSubject, "All readers update");
      assert.match(updatedUnrestricted.templateHtml ?? "", /Updated letter body/);

      await db.insert(broadcasts).values(
        Array.from({ length: 55 }, (_, index) => ({
          createdByUserId: adminId,
          environment: "test",
          from: "news@example.com",
          name: `List proof ${index}`,
          orgId: firstOrgId,
          sourceTemplateId: templateId,
          templateName: "Audience welcome",
          templateRequiredVariables: [],
          templateSubject: "List proof",
          templateText: "List proof",
        })),
      );
      assert.equal((await listBroadcasts({ actorUserId: adminId, orgId: firstOrgId })).length, 58);
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

test(
  "PostgreSQL audience and contact search filters in the database without rescoping audience counts",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { eq },
      { db },
      { audiences, contacts, orgMembers, orgs, users },
      {
        createAudience,
        createContact,
        deleteUnsubscribedContacts,
        getAudience,
        listAudiences,
        listContacts,
      },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/audiences.ts"),
    ]);
    const orgId = randomUUID();
    const adminId = `audience-search-admin-${randomUUID()}`;
    const now = new Date("2026-08-31T02:03:04.000Z");
    const lock = await db.$client.reserve();
    const emails = (rows) => rows.map((row) => row.email).sort();

    await lock`SELECT pg_advisory_lock(${190024})`;
    try {
      await db.insert(orgs).values({ id: orgId, name: "Search tenant" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: adminId,
        name: "Search admin",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values({ orgId, role: "admin", userId: adminId });

      const weekly = await createAudience({
        actorUserId: adminId, now, orgId, payload: { name: "Weekly readers" },
      });
      await createAudience({
        actorUserId: adminId, now, orgId, payload: { name: "Weekly archive" },
      });
      await createAudience({
        actorUserId: adminId, now, orgId, payload: { name: "Product digest" },
      });

      const seed = [
        { email: "ada@example.net", name: "Ada Lovelace" },
        { email: "grace@example.net", name: "Grace Hopper" },
        { email: "a_b@example.net", name: "Literal underscore" },
        { email: "axb@example.net", name: "Wildcard bait" },
        { email: "gone@example.net", name: "Gone Away" },
        { email: "left@example.net", name: "Left Early" },
      ];
      for (const payload of seed) {
        await createContact({
          actorUserId: adminId, audienceId: weekly.id, now, orgId, payload,
        });
      }
      await db
        .update(contacts)
        .set({ unsubscribedAt: now })
        .where(eq(contacts.email, "gone@example.net"));
      await db
        .update(contacts)
        .set({ unsubscribedAt: now })
        .where(eq(contacts.email, "left@example.net"));

      const principal = { actorUserId: adminId, audienceId: weekly.id, orgId };
      const contactsMatching = (search) => listContacts({ ...principal, search });

      // Matches email and name, case-insensitively, and nothing else.
      assert.deepEqual(emails(await contactsMatching("ada")), ["ada@example.net"]);
      assert.deepEqual(emails(await contactsMatching("ADA")), ["ada@example.net"]);
      assert.deepEqual(emails(await contactsMatching("Hopper")), ["grace@example.net"]);
      assert.deepEqual(emails(await contactsMatching("hopper")), ["grace@example.net"]);
      assert.deepEqual(emails(await contactsMatching("no-such-contact")), []);

      // An absent search returns the whole audience.
      assert.equal((await contactsMatching(null)).length, seed.length);
      assert.equal((await listContacts(principal)).length, seed.length);

      // LIKE metacharacters are literal, not wildcards.
      assert.deepEqual(emails(await contactsMatching("a_b")), ["a_b@example.net"]);
      assert.deepEqual(emails(await contactsMatching("%")), []);
      assert.deepEqual(emails(await contactsMatching("%@%")), []);
      assert.deepEqual(emails(await contactsMatching("\\")), []);

      // Audience names filter the same way.
      const audienceNames = async (search) =>
        (await listAudiences({ actorUserId: adminId, orgId, search }))
          .map((record) => record.name)
          .sort();
      assert.deepEqual(await audienceNames("weekly"), [
        "Weekly archive",
        "Weekly readers",
      ]);
      assert.deepEqual(await audienceNames("DIGEST"), ["Product digest"]);
      assert.deepEqual(await audienceNames("%"), []);
      assert.equal((await audienceNames(null)).length, 3);

      // A contact search must never rescope the audience's own counts, which are
      // what the console's "delete all unsubscribed" control is labelled from.
      const filtered = await contactsMatching("ada");
      assert.equal(filtered.length, 1);
      const record = await getAudience({ actorUserId: adminId, audienceId: weekly.id, orgId });
      assert.equal(record.contactCount, 6);
      assert.equal(record.activeContactCount, 4);
      assert.equal(record.contactCount - record.activeContactCount, 2);

      // And the bulk delete stays whole-audience regardless of any search.
      const removed = await deleteUnsubscribedContacts({
        actorUserId: adminId, audienceId: weekly.id, orgId,
      });
      assert.equal(removed.deleted, 2);
      assert.equal((await listContacts(principal)).length, 4);
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, adminId));
      } finally {
        await lock`SELECT pg_advisory_unlock(${190024})`;
        lock.release();
      }
    }
  },
);
