import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

async function fixture(name, messageId) {
  const payload = JSON.parse(
    await readFile(
      new URL(`fixtures/providers/${name}.json`, import.meta.url),
      "utf8",
    ),
  );

  if (typeof payload.Message === "string") {
    const message = JSON.parse(payload.Message);
    message.mail.tags.paperboy_message_id = [messageId];
    payload.Message = JSON.stringify(message);
  } else {
    payload.detail.mail.tags.paperboy_message_id = [messageId];
  }

  return payload;
}

test(
  "SES provider events correlate, replay idempotently, and update tenant suppressions",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { asc, count, eq },
      { db },
      {
        emailSuppressions,
        events,
        messages,
        orgMembers,
        orgs,
        providerEventIngestions,
        users,
      },
      { ingestOutboundProviderEvent, OutboundProviderEventError },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/outbound-provider-events.ts"),
    ]);
    const orgId = randomUUID();
    const otherOrgId = randomUUID();
    const userId = `ses-events-${randomUUID()}`;
    const otherUserId = `ses-events-other-${randomUUID()}`;
    const messageId = randomUUID();
    const providerMessageId = "010001-ses-message-fixture";
    const receivedAt = new Date("2026-08-24T01:06:00.000Z");
    const lock = await db.$client.connect();
    await lock.query("SELECT pg_advisory_lock($1)", [190034]);

    try {
      await db.insert(orgs).values([
        { id: orgId, name: "SES events" },
        { id: otherOrgId, name: "Other SES events" },
      ]);
      await db.insert(users).values([
        {
          email: `${randomUUID()}@example.com`,
          id: userId,
          name: "SES event operator",
          timezone: "Australia/Sydney",
        },
        {
          email: `${randomUUID()}@example.com`,
          id: otherUserId,
          name: "Other SES event operator",
          timezone: "America/New_York",
        },
      ]);
      await db.insert(orgMembers).values([
        { orgId, role: "admin", userId },
        { orgId: otherOrgId, role: "admin", userId: otherUserId },
      ]);
      await db.insert(messages).values({
        deliveryMode: "live",
        environment: "live",
        from: "news@example.com",
        id: messageId,
        orgId,
        outboundProvider: "aws-ses",
        providerMessageId,
        sentAt: receivedAt,
        status: "sent",
        subject: "SES event fixture",
        textBody: "SES event fixture",
        to: ["reader@example.net"],
      });

      const bouncePayload = await fixture("aws-ses-sns-bounce", messageId);
      const first = await ingestOutboundProviderEvent({
        actorUserId: userId,
        now: receivedAt,
        orgId,
        payload: bouncePayload,
        provider: "aws-ses",
      });
      const replay = await ingestOutboundProviderEvent({
        actorUserId: userId,
        now: new Date("2026-08-24T01:07:00.000Z"),
        orgId,
        payload: bouncePayload,
        provider: "aws-ses",
      });

      assert.equal(first[0].messageId, messageId);
      assert.equal(first[0].type, "bounced");
      assert.equal(first[0].suppressionCount, 1);
      assert.equal(first[0].replayed, false);
      assert.equal(replay[0].eventId, first[0].eventId);
      assert.equal(replay[0].replayed, true);

      const complaint = await ingestOutboundProviderEvent({
        actorUserId: userId,
        now: receivedAt,
        orgId,
        payload: await fixture("aws-ses-sns-complaint", messageId),
        provider: "aws-ses",
      });
      const delivery = await ingestOutboundProviderEvent({
        actorUserId: userId,
        now: receivedAt,
        orgId,
        payload: await fixture("aws-ses-sns-delivery", messageId),
        provider: "aws-ses",
      });
      const delay = await ingestOutboundProviderEvent({
        actorUserId: userId,
        now: receivedAt,
        orgId,
        payload: await fixture("aws-ses-eventbridge-delay", messageId),
        provider: "aws-ses",
      });
      assert.equal(complaint[0].type, "complained");
      assert.equal(delivery[0].type, "delivered");
      assert.equal(delay[0].type, "deferred");

      const [suppression] = await db
        .select({ email: emailSuppressions.email, reason: emailSuppressions.reason })
        .from(emailSuppressions)
        .where(eq(emailSuppressions.orgId, orgId));
      assert.deepEqual(suppression, {
        email: "reader@example.net",
        reason: "complained",
      });
      const timeline = await db
        .select({ data: events.data, type: events.type })
        .from(events)
        .where(eq(events.messageId, messageId))
        .orderBy(asc(events.createdAt));
      assert.deepEqual(
        timeline.map((event) => event.type),
        ["bounced", "complained", "delivered", "deferred"],
      );
      assert.equal(JSON.stringify(timeline).includes("reader@example.net"), false);
      assert.equal(JSON.stringify(timeline).includes("diagnosticCode"), false);
      const [{ ingestionCount }] = await db
        .select({ ingestionCount: count() })
        .from(providerEventIngestions)
        .where(eq(providerEventIngestions.orgId, orgId));
      assert.equal(Number(ingestionCount), 4);

      await assert.rejects(
        () =>
          ingestOutboundProviderEvent({
            actorUserId: otherUserId,
            now: receivedAt,
            orgId: otherOrgId,
            payload: bouncePayload,
            provider: "aws-ses",
          }),
        (error) =>
          error instanceof OutboundProviderEventError &&
          error.code === "NO_MATCHING_MESSAGE",
      );
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(orgs).where(eq(orgs.id, otherOrgId));
        await db.delete(users).where(eq(users.id, userId));
        await db.delete(users).where(eq(users.id, otherUserId));
      } finally {
        await lock.query("SELECT pg_advisory_unlock($1)", [190034]);
        lock.release();
        await db.$client.end();
      }
    }
  },
);
