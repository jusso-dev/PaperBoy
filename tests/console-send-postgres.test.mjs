import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;
const smtpUrl = process.env.PAPERBOY_TEST_SMTP_URL;
const mailpitUrl = process.env.PAPERBOY_TEST_MAILPIT_URL;

async function findCapturedMessage(messageId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.ok, true);
    const list = await response.json();
    const captured = list.messages.find(
      (candidate) => candidate.MessageID === messageId,
    );

    if (captured) return captured;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

test(
  "admin console send enters the live provider queue, appears in logs, and blocks members",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async (t) => {
    if (process.env.CI) {
      assert.ok(
        smtpUrl && mailpitUrl,
        "CI must provide Mailpit SMTP and HTTP endpoints for console-send proof.",
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    const [
      { eq },
      { db },
      { domainDkimKeys, domains, messages, orgMembers, orgs, users },
      { AuthorizationError },
      { queueConsoleTestEmail },
      { getMessageDeliveryStatus },
      { createSmtpAdapter },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/authorization.ts"),
      import("../src/lib/console-send.ts"),
      import("../src/lib/message-statuses.ts"),
      import("../src/lib/smtp-adapter.ts"),
    ]);
    const orgId = randomUUID();
    const domainId = randomUUID();
    const adminId = `console-admin-${randomUUID()}`;
    const memberId = `console-member-${randomUUID()}`;
    const domainName = `console-${randomUUID()}.example`;
    const recipient = `reader-${randomUUID()}@example.net`;
    const subject = `PaperBoy console proof ${randomUUID()}`;
    const fixedNow = new Date("2026-08-24T05:06:07.000Z");
    const lock = await db.$client.reserve();

    await lock`SELECT pg_advisory_lock(${190025})`;
    try {
      await db.insert(orgs).values({ id: orgId, name: "Console send tenant" });
      await db.insert(users).values([
        {
          email: `${randomUUID()}@example.com`,
          id: adminId,
          name: "Console admin",
          timezone: "Australia/Sydney",
        },
        {
          email: `${randomUUID()}@example.com`,
          id: memberId,
          name: "Console member",
          timezone: "UTC",
        },
      ]);
      await db.insert(orgMembers).values([
        { orgId, role: "admin", userId: adminId },
        { orgId, role: "member", userId: memberId },
      ]);
      await db.insert(domains).values({
        id: domainId,
        name: domainName,
        orgId,
        status: "verified",
        verifiedAt: fixedNow,
      });
      await db.insert(domainDkimKeys).values({
        activatedAt: fixedNow,
        dnsStatus: "matched",
        domainId,
        encryptedPrivateKey: "integration-only",
        publicKey: "integration-only",
        selector: "pb-console-test",
        status: "active",
      });

      const queued = await queueConsoleTestEmail({
        actorUserId: adminId,
        fromDomain: domainName,
        html: "<p>Console Mailpit proof.</p>",
        orgId,
        subject,
        text: "Console Mailpit proof.",
        to: recipient,
      });

      assert.equal(queued.deliveryMode, "live");
      assert.equal(queued.environment, "live");
      assert.equal(queued.provider, "smtp");
      assert.equal(queued.status, "queued");
      const [stored] = await db
        .select({
          apiKeyId: messages.apiKeyId,
          deliveryMode: messages.deliveryMode,
          environment: messages.environment,
          from: messages.from,
          html: messages.html,
          provider: messages.outboundProvider,
          subject: messages.subject,
          text: messages.textBody,
          to: messages.to,
        })
        .from(messages)
        .where(eq(messages.id, queued.id));
      assert.deepEqual(stored, {
        apiKeyId: null,
        deliveryMode: "live",
        environment: "live",
        from: `PaperBoy <test@${domainName}>`,
        html: "<p>Console Mailpit proof.</p>",
        provider: "smtp",
        subject,
        text: "Console Mailpit proof.",
        to: [recipient],
      });
      assert.equal(
        (
          await getMessageDeliveryStatus({
            actorUserId: adminId,
            environment: "live",
            messageId: queued.id,
            orgId,
          })
        ).id,
        queued.id,
      );

      await assert.rejects(
        () =>
          queueConsoleTestEmail({
            actorUserId: memberId,
            fromDomain: domainName,
            html: "<p>Must not queue.</p>",
            orgId,
            subject: "Blocked member",
            text: "Must not queue.",
            to: recipient,
          }),
        AuthorizationError,
      );
      assert.equal(
        (
          await db
            .select({ id: messages.id })
            .from(messages)
            .where(eq(messages.orgId, orgId))
        ).length,
        1,
      );

      if (smtpUrl && mailpitUrl) {
        await t.test(
          "stored console message reaches the real Mailpit SMTP adapter",
          async () => {
            const adapter = createSmtpAdapter({
              environment: {
                SMTP_TLS_MODE: "disabled",
                SMTP_URL: smtpUrl,
              },
              now: () => fixedNow,
            });
            try {
              await adapter.verify();
              await adapter.send({
                attemptCount: 1,
                attachments: [],
                deliveryMode: queued.deliveryMode,
                environment: queued.environment,
                from: stored.from,
                html: stored.html,
                id: queued.id,
                orgId,
                provider: stored.provider,
                subject: stored.subject,
                text: stored.text,
                to: stored.to,
              });
              const captured = await findCapturedMessage(
                `${queued.id}@${domainName}`,
              );
              assert.ok(captured);
              assert.equal(captured.Subject, subject);
              assert.deepEqual(captured.From, {
                Address: `test@${domainName}`,
                Name: "PaperBoy",
              });
              assert.deepEqual(captured.To, [
                { Address: recipient, Name: "" },
              ]);
              const response = await fetch(
                `${mailpitUrl}/api/v1/message/${captured.ID}`,
                { signal: AbortSignal.timeout(5_000) },
              );
              assert.equal(response.ok, true);
              const message = await response.json();
              assert.equal(message.HTML, "<p>Console Mailpit proof.</p>");
              assert.equal(message.Text, "Console Mailpit proof.");
            } finally {
              adapter.close();
            }
          },
        );
      }
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, adminId));
        await db.delete(users).where(eq(users.id, memberId));
      } finally {
        await lock`SELECT pg_advisory_unlock(${190025})`;
        lock.release();
      }
    }
  },
);
