import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

function messageState(index, createdAt) {
  switch (index % 4) {
    case 1:
      return {
        attemptCount: 1,
        lastAttemptAt: createdAt,
        leaseExpiresAt: new Date(createdAt.getTime() + 300_000),
        status: "sending",
        workerId: `logs-worker-${index}`,
      };
    case 2:
      return {
        attemptCount: 1,
        lastAttemptAt: createdAt,
        sentAt: createdAt,
        status: "sent",
      };
    case 3:
      return {
        attemptCount: 3,
        failedAt: createdAt,
        failureReason: "Provider rejected the message.",
        lastAttemptAt: createdAt,
        lastErrorCode: "provider_rejected",
        status: "failed",
      };
    default:
      return { status: "queued" };
  }
}

test(
  "PostgreSQL message logs stay bounded, indexed, filtered, tenant-safe, and owner-gated for MIME",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;

    const [
      { eq, inArray },
      { db },
      { domains, messageAttachments, messages, orgMembers, orgs, users },
      { listMessageEvents, recordMessageEvent },
      { buildOwnerMessageMime },
      { listMessageDeliveryStatuses },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/message-events.ts"),
      import("../src/lib/message-mime.ts"),
      import("../src/lib/message-statuses.ts"),
    ]);
    const orgId = randomUUID();
    const otherOrgId = randomUUID();
    const ownerId = `logs-owner-${randomUUID()}`;
    const adminId = `logs-admin-${randomUUID()}`;
    const memberId = `logs-member-${randomUUID()}`;
    const alphaDomainId = randomUUID();
    const betaDomainId = randomUUID();
    const otherDomainId = randomUUID();
    const base = new Date("2026-08-01T00:00:00.000Z");
    const rows = Array.from({ length: 120 }, (_, index) => {
      const createdAt = new Date(base.getTime() + index * 60_000);
      const live = index % 2 === 0;

      return {
        ...messageState(index, createdAt),
        createdAt,
        deliveryMode: live ? "live" : "test-sink",
        domainId: live ? alphaDomainId : betaDomainId,
        environment: live ? "live" : "test",
        from: live ? "news@alpha.example.com" : "news@beta.example.com",
        html: `<p>Private edition ${index}</p>`,
        id: randomUUID(),
        nextAttemptAt: createdAt,
        orgId,
        subject: `Edition ${index}`,
        textBody: `Private edition ${index}`,
        to: [`reader-${index}@example.net`],
        updatedAt: createdAt,
      };
    });
    const mimeMessage = rows[118];
    const attachmentId = randomUUID();
    const attachment = Buffer.from("Cloudflare-compatible attachment proof\n");
    const storageKey = `${orgId}/${mimeMessage.id}/${attachmentId}.blob`;
    const lock = await db.$client.connect();

    await lock.query("SELECT pg_advisory_lock($1)", [190026]);

    try {
      await db.insert(orgs).values([
        { id: orgId, name: "Message log integration" },
        { id: otherOrgId, name: "Other message log organization" },
      ]);
      await db.insert(users).values([
        {
          email: `${randomUUID()}@example.com`,
          id: ownerId,
          name: "Log owner",
          timezone: "Australia/Sydney",
        },
        {
          email: `${randomUUID()}@example.com`,
          id: adminId,
          name: "Log administrator",
          timezone: "Pacific/Auckland",
        },
        {
          email: `${randomUUID()}@example.com`,
          id: memberId,
          name: "Log member",
          timezone: "UTC",
        },
      ]);
      await db.insert(orgMembers).values([
        { orgId, role: "owner", userId: ownerId },
        { orgId, role: "admin", userId: adminId },
        { orgId, role: "member", userId: memberId },
        { orgId: otherOrgId, role: "owner", userId: ownerId },
      ]);
      await db.insert(domains).values([
        { id: alphaDomainId, name: "alpha.example.com", orgId, status: "verified" },
        { id: betaDomainId, name: "beta.example.com", orgId, status: "verified" },
        {
          id: otherDomainId,
          name: "other.example.com",
          orgId: otherOrgId,
          status: "verified",
        },
      ]);
      await db.insert(messages).values(rows);
      const [otherMessage] = await db
        .insert(messages)
        .values({
          createdAt: new Date("2026-08-02T00:00:00.000Z"),
          domainId: otherDomainId,
          from: "news@other.example.com",
          id: randomUUID(),
          nextAttemptAt: new Date("2026-08-02T00:00:00.000Z"),
          orgId: otherOrgId,
          subject: "Other tenant edition",
          textBody: "Never visible to the first tenant.",
          to: ["other@example.net"],
        })
        .returning({ id: messages.id });
      await db.insert(messageAttachments).values({
        byteSize: attachment.length,
        contentSha256: createHash("sha256").update(attachment).digest("hex"),
        contentType: "text/plain",
        filename: "proof.txt",
        id: attachmentId,
        messageId: mimeMessage.id,
        position: 0,
        storageKey,
      });
      await recordMessageEvent({
        createdAt: mimeMessage.createdAt,
        data: { recipient: "must-not-leak@example.net" },
        messageId: mimeMessage.id,
        type: "queued",
      });
      await recordMessageEvent({
        createdAt: mimeMessage.sentAt,
        data: { provider: "cloudflare-email" },
        messageId: mimeMessage.id,
        type: "delivered",
      });

      const latest = await listMessageDeliveryStatuses({
        actorUserId: memberId,
        limit: 50,
        orgId,
      });
      assert.equal(latest.length, 50);
      assert.equal(latest[0].id, rows[119].id);
      assert.equal(latest[49].id, rows[70].id);
      assert.equal(latest.some((message) => message.id === otherMessage.id), false);

      const filtered = await listMessageDeliveryStatuses({
        actorUserId: memberId,
        createdAtBefore: new Date("2026-08-01T01:40:00.000Z"),
        createdAtFrom: new Date("2026-08-01T01:30:00.000Z"),
        domainId: alphaDomainId,
        limit: 100,
        orgId,
        status: "sent",
      });
      assert.deepEqual(
        filtered.map((message) => message.id),
        [rows[98].id, rows[94].id, rows[90].id],
      );
      assert.equal(filtered.every((message) => message.domainId === alphaDomainId), true);

      const liveOnly = await listMessageDeliveryStatuses({
        actorUserId: memberId,
        environment: "live",
        limit: 100,
        orgId,
      });
      assert.equal(liveOnly.length, 60);
      assert.equal(liveOnly.every((message) => message.environment === "live"), true);

      const otherTenant = await listMessageDeliveryStatuses({
        actorUserId: ownerId,
        limit: 50,
        orgId: otherOrgId,
      });
      assert.deepEqual(otherTenant.map((message) => message.id), [otherMessage.id]);

      const timeline = await listMessageEvents({
        actorUserId: memberId,
        environment: "live",
        messageId: mimeMessage.id,
        orgId,
      });
      assert.deepEqual(timeline.map((event) => event.type), ["queued", "delivered"]);
      assert.equal(timeline[0].data.recipient, "must-not-leak@example.net");

      for (const actorUserId of [adminId, memberId]) {
        await assert.rejects(
          buildOwnerMessageMime({ actorUserId, messageId: mimeMessage.id, orgId }),
          (error) => error?.code === "FORBIDDEN",
        );
      }
      const eml = await buildOwnerMessageMime({
        actorUserId: ownerId,
        attachmentStore: {
          async delete() {},
          async put() {},
          async read(receivedKey) {
            assert.equal(receivedKey, storageKey);
            return attachment;
          },
        },
        messageId: mimeMessage.id,
        orgId,
      });
      const emlText = eml.toString("utf8");
      assert.match(emlText, /Subject: Edition 118/);
      assert.match(emlText, /X-PaperBoy-Message-ID:/i);
      assert.match(emlText, /filename="?proof\.txt"?/);
      assert.match(emlText, new RegExp(attachment.toString("base64")));
      assert.doesNotMatch(emlText, /DKIM-Signature:/i);
      assert.doesNotMatch(emlText, /ARC-Seal:/i);

      const indexResult = await lock.query(
        `SELECT indexname FROM pg_indexes
         WHERE schemaname = 'public'
           AND tablename = 'messages'
           AND indexname = ANY($1::text[])`,
        [[
          "messages_org_id_created_at_id_idx",
          "messages_org_id_status_created_at_id_idx",
          "messages_org_id_domain_id_created_at_id_idx",
        ]],
      );
      assert.deepEqual(
        indexResult.rows.map((row) => row.indexname).sort(),
        [
          "messages_org_id_created_at_id_idx",
          "messages_org_id_domain_id_created_at_id_idx",
          "messages_org_id_status_created_at_id_idx",
        ],
      );
    } finally {
      try {
        await db.delete(orgs).where(inArray(orgs.id, [orgId, otherOrgId]));
        await db.delete(users).where(inArray(users.id, [ownerId, adminId, memberId]));
      } finally {
        await lock.query("SELECT pg_advisory_unlock($1)", [190026]);
        lock.release();
        await db.$client.end();
      }
    }
  },
);
