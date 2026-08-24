import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;
const fixture = (name) =>
  readFile(new URL(`fixtures/feedback/${name}.eml`, import.meta.url));
const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function runFeedbackCli({ databaseUrl, keyFile, raw }) {
  const environment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    PAPERBOY_FEEDBACK_API_KEY_FILE: keyFile,
  };
  delete environment.PAPERBOY_FEEDBACK_API_KEY;
  const child = spawn(
    process.execPath,
    ["--no-install", "src/feedback-ingest.ts"],
    {
      cwd: repositoryRoot,
      env: environment,
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  child.stdin.end(raw);
  const [code] = await once(child, "close");

  assert.equal(Buffer.concat(stderr).toString("utf8"), "");
  assert.equal(code, 0);
  return JSON.parse(Buffer.concat(stdout).toString("utf8"));
}

test(
  "PostgreSQL feedback ingestion suppresses hard bounces without test sends",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { eq, inArray },
      { db },
      {
        apiKeys,
        emailSuppressions,
        events,
        feedbackIngestions,
        messages,
        orgMembers,
        orgs,
        users,
        webhookDeliveries,
      },
      { EmailError, emailRequestHash, parseSendEmailInput },
      { generateApiKey },
      { ingestFeedbackReport },
      { queueEmail },
      { configureWebhookEndpoint },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/email-core.ts"),
      import("../src/lib/api-key-crypto.ts"),
      import("../src/lib/feedback.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/webhooks.ts"),
    ]);
    const orgId = randomUUID();
    const apiKeyId = randomUUID();
    const userId = `feedback-user-${randomUUID()}`;
    const integrationLock = await db.$client.reserve();
    const encryptionKey = Buffer.alloc(32, 12);
    const generatedKey = generateApiKey("test");
    const secretDirectory = await mkdtemp(
      join(tmpdir(), "paperboy-feedback-test-"),
    );
    const keyFile = join(secretDirectory, "api-key");
    await writeFile(keyFile, `${generatedKey.rawKey}\n`, { mode: 0o600 });
    const messageRows = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        to: ["Hard Bounce <hard-bounce@example.net>"],
      },
      {
        id: "22222222-2222-4222-8222-222222222222",
        to: ["soft-bounce@example.net"],
      },
      {
        id: "33333333-3333-4333-8333-333333333333",
        to: ["complaint@example.net"],
      },
    ];
    const hardReplayPayload = {
      from: "sender@example.com",
      subject: "Feedback fixture",
      text: "Private body",
      to: ["Hard Bounce <hard-bounce@example.net>"],
    };

    await integrationLock`SELECT pg_advisory_lock(${190019})`;

    try {
      await db.insert(orgs).values({ id: orgId, name: "Feedback integration" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Feedback operator",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values({ orgId, role: "admin", userId });
      await db.insert(apiKeys).values({
        createdByUserId: userId,
        environment: "test",
        id: apiKeyId,
        keyHash: generatedKey.keyHash,
        keyId: generatedKey.keyId,
        name: "Feedback test key",
        orgId,
      });
      await db.insert(messages).values(
        messageRows.map((message) => ({
          apiKeyId,
          deliveryMode: "test-sink",
          environment: "test",
          from: "sender@example.com",
          html: null,
          id: message.id,
          idempotencyKey:
            message.id === "11111111-1111-4111-8111-111111111111"
              ? "hard-replay"
              : null,
          orgId,
          requestHash:
            message.id === "11111111-1111-4111-8111-111111111111"
              ? emailRequestHash(parseSendEmailInput(hardReplayPayload))
              : null,
          subject: "Feedback fixture",
          textBody: "Private body",
          to: message.to,
        })),
      );
      await configureWebhookEndpoint({
        actorUserId: userId,
        encryptionKey,
        orgId,
        payload: { url: "https://hooks.example.com/feedback" },
      });

      const hardRaw = await fixture("hard-bounce");
      const cli = await runFeedbackCli({
        databaseUrl,
        keyFile,
        raw: hardRaw,
      });
      const hard = await ingestFeedbackReport({
        actorUserId: userId,
        now: new Date("2026-08-24T02:21:00.000Z"),
        orgId,
        raw: hardRaw,
      });
      const soft = await ingestFeedbackReport({
        actorUserId: userId,
        now: new Date("2026-08-24T02:22:00.000Z"),
        orgId,
        raw: await fixture("soft-bounce"),
      });
      const complaint = await ingestFeedbackReport({
        actorUserId: userId,
        now: new Date("2026-08-24T02:23:00.000Z"),
        orgId,
        raw: await fixture("complaint"),
      });

      assert.equal(cli.protocol_time_zone, "UTC");
      assert.equal(cli.data[0].classification, "hard_bounce");
      assert.equal(cli.data[0].suppressed, true);
      assert.equal(cli.data[0].replayed, false);
      assert.equal(hard[0].classification, "hard_bounce");
      assert.equal(hard[0].suppressed, true);
      assert.equal(hard[0].eventId, cli.data[0].event_id);
      assert.equal(hard[0].replayed, true);
      assert.equal(soft[0].classification, "soft_bounce");
      assert.equal(soft[0].suppressed, false);
      assert.equal(complaint[0].classification, "complaint");
      assert.equal(complaint[0].suppressed, true);

      const suppressions = await db
        .select({ email: emailSuppressions.email, reason: emailSuppressions.reason })
        .from(emailSuppressions)
        .where(eq(emailSuppressions.orgId, orgId));
      assert.deepEqual(
        suppressions.sort((a, b) => a.email.localeCompare(b.email)),
        [
          { email: "complaint@example.net", reason: "complained" },
          { email: "hard-bounce@example.net", reason: "bounced" },
        ],
      );

      const storedEvents = await db
        .select({ data: events.data, type: events.type })
        .from(events)
        .where(
          inArray(
            events.messageId,
            messageRows.map((message) => message.id),
          ),
        );
      assert.deepEqual(
        storedEvents.map((event) => [event.type, event.data.classification]).sort(),
        [
          ["bounced", "hard_bounce"],
          ["bounced", "soft_bounce"],
          ["complained", "complaint"],
        ],
      );
      assert.equal(
        (
          await db
            .select()
            .from(feedbackIngestions)
            .where(eq(feedbackIngestions.orgId, orgId))
        ).length,
        3,
      );
      const deliveries = await db
        .select()
        .from(webhookDeliveries)
        .where(eq(webhookDeliveries.orgId, orgId));
      assert.equal(deliveries.length, 3);
      assert.equal(
        deliveries.some((delivery) =>
          delivery.body.includes("hard-bounce@example.net"),
        ),
        false,
      );
      assert.deepEqual(
        deliveries.map((delivery) => JSON.parse(delivery.body).type).sort(),
        ["email.bounced", "email.bounced", "email.complained"],
      );

      const principal = {
        actorUserId: userId,
        apiKeyId,
        environment: "test",
        orgId,
      };
      await assert.rejects(
        () =>
          queueEmail({
            idempotencyKey: "hard-replay",
            payload: hardReplayPayload,
            principal,
          }),
        (error) =>
          error instanceof EmailError &&
          error.code === "RECIPIENT_SUPPRESSED" &&
          error.issues[0].message.includes("permanent bounce"),
      );
      await assert.rejects(
        () =>
          queueEmail({
            payload: {
              from: "sender@example.com",
              subject: "Must not send",
              text: "No live or test delivery should be queued.",
              to: "hard-bounce@example.net",
            },
            principal,
          }),
        (error) =>
          error instanceof EmailError &&
          error.code === "RECIPIENT_SUPPRESSED" &&
          error.issues[0].message.includes("permanent bounce"),
      );
      await assert.rejects(
        () =>
          queueEmail({
            payload: {
              from: "sender@example.com",
              subject: "Must not send",
              text: "No live or test delivery should be queued.",
              to: "complaint@example.net",
            },
            principal,
          }),
        (error) =>
          error instanceof EmailError &&
          error.code === "RECIPIENT_SUPPRESSED" &&
          error.issues[0].message.includes("complaint"),
      );
      const allowed = await queueEmail({
        payload: {
          from: "sender@example.com",
          subject: "Soft bounce may retry later",
          text: "Queued only; no adapter is invoked by this test.",
          to: "soft-bounce@example.net",
        },
        principal,
      });
      assert.equal(allowed.status, "queued");
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await rm(secretDirectory, { force: true, recursive: true });
        await integrationLock`SELECT pg_advisory_unlock(${190019})`;
        integrationLock.release();
      }
    }
  },
);
