import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { SendEmailCommand } from "@aws-sdk/client-sesv2";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "PostgreSQL snapshots org and domain provider routing before queue insertion",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { count, eq },
      { db },
      { apiKeys, domainDkimKeys, domains, messages, orgMembers, orgs, users },
      { queueEmail },
      {
        getOutboundProviderSettings,
        updateOutboundProviderSettings,
      },
      {
        OutboundProviderConfigurationError,
        organizationAwsSesVariable,
        providerAwsSesConfiguration,
      },
      { createAwsSesAdapter },
      { postgresWorkerStore },
      { processNextMessage },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/messages.ts"),
      import("../src/lib/outbound-providers.ts"),
      import("../src/lib/outbound-provider-configuration.ts"),
      import("../src/lib/aws-ses-adapter.ts"),
      import("../src/lib/postgres-worker-store.ts"),
      import("../src/lib/worker-core.ts"),
    ]);
    const orgId = randomUUID();
    const domainId = randomUUID();
    const userId = `provider-user-${randomUUID()}`;
    const apiKeyId = randomUUID();
    const domainName = `mail-${randomUUID()}.example.com`;
    const smtpEnvironment = {
      SMTP_TLS_MODE: "disabled",
      SMTP_URL: "smtp://127.0.0.1:1025",
    };
    const cloudflareEnvironment = {
      CLOUDFLARE_EMAIL_SMTP_URL:
        "smtps://api_token:test-token@smtp.mx.cloudflare.net:465",
    };
    const sesEnvironment = {
      [organizationAwsSesVariable(orgId, "ACCESS_KEY_ID")]:
        "TESTSESACCESSKEY02",
      [organizationAwsSesVariable(orgId, "REGION")]: "ap-southeast-2",
      [organizationAwsSesVariable(orgId, "SECRET_ACCESS_KEY")]:
        "fixture-secret-access-key",
    };
    const integrationLock = await db.$client.reserve();
    await integrationLock`SELECT pg_advisory_lock(${190020})`;

    try {
      await db.insert(orgs).values({ id: orgId, name: "Provider integration" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Provider operator",
        timezone: "Australia/Sydney",
      });
      await db.insert(orgMembers).values({ orgId, role: "admin", userId });
      await db.insert(apiKeys).values({
        createdByUserId: userId,
        environment: "live",
        id: apiKeyId,
        keyHash: "fixture-key-hash",
        keyId: `fixture-${randomUUID()}`,
        name: "Provider fixture",
        orgId,
      });
      await db.insert(domains).values({
        id: domainId,
        name: domainName,
        orgId,
        status: "verified",
        verifiedAt: new Date(),
      });
      await db.insert(domainDkimKeys).values({
        activatedAt: new Date(),
        dnsStatus: "matched",
        domainId,
        encryptedPrivateKey: "fixture-encrypted-private-key",
        publicKey: "fixture-public-key",
        selector: "pb20260824abcdef12",
        status: "active",
      });
      const principal = {
        actorUserId: userId,
        apiKeyId,
        environment: "live",
        orgId,
      };
      const payload = {
        from: `PaperBoy <news@${domainName}>`,
        subject: "Stable provider snapshot",
        text: "Provider-neutral body",
        to: "reader@example.net",
      };

      const first = await queueEmail({
        idempotencyKey: "provider-snapshot",
        payload,
        principal,
        providerEnvironment: smtpEnvironment,
      });
      assert.equal(first.provider, "smtp");

      await updateOutboundProviderSettings({
        actorUserId: userId,
        environment: cloudflareEnvironment,
        orgId,
        payload: { default_provider: "cloudflare-email" },
      });
      const replay = await queueEmail({
        idempotencyKey: "provider-snapshot",
        payload,
        principal,
        providerEnvironment: {},
      });
      assert.equal(replay.id, first.id);
      assert.equal(replay.provider, "smtp");

      const second = await queueEmail({
        payload: { ...payload, to: "second@example.net" },
        principal,
        providerEnvironment: cloudflareEnvironment,
      });
      assert.equal(second.provider, "cloudflare-email");

      await updateOutboundProviderSettings({
        actorUserId: userId,
        environment: smtpEnvironment,
        orgId,
        payload: {
          domain_overrides: [{ domain_id: domainId, provider: "smtp" }],
        },
      });
      const third = await queueEmail({
        payload: { ...payload, to: "third@example.net" },
        principal,
        providerEnvironment: smtpEnvironment,
      });
      assert.equal(third.provider, "smtp");

      const settings = await getOutboundProviderSettings({
        actorUserId: userId,
        environment: smtpEnvironment,
        orgId,
      });
      assert.equal(settings.defaultProvider, "cloudflare-email");
      assert.equal(settings.domains[0].overrideProvider, "smtp");
      assert.equal(settings.domains[0].effectiveProvider, "smtp");
      assert.equal(settings.updatedAt instanceof Date, true);

      await updateOutboundProviderSettings({
        actorUserId: userId,
        orgId,
        payload: {
          domain_overrides: [{ domain_id: domainId, provider: null }],
        },
      });
      const [{ before }] = await db
        .select({ before: count() })
        .from(messages)
        .where(eq(messages.orgId, orgId));
      await assert.rejects(
        () =>
          queueEmail({
            payload: { ...payload, to: "missing@example.net" },
            principal,
            providerEnvironment: {},
          }),
        (error) =>
          error instanceof OutboundProviderConfigurationError &&
          error.code === "CREDENTIALS_MISSING" &&
          error.provider === "cloudflare-email",
      );
      const [{ after }] = await db
        .select({ after: count() })
        .from(messages)
        .where(eq(messages.orgId, orgId));
      assert.equal(Number(after), Number(before));

      await updateOutboundProviderSettings({
        actorUserId: userId,
        environment: sesEnvironment,
        orgId,
        payload: { default_provider: "aws-ses" },
      });
      const fourth = await queueEmail({
        payload: { ...payload, to: "ses@example.net" },
        principal,
        providerEnvironment: sesEnvironment,
      });
      assert.equal(fourth.provider, "aws-ses");
      await db
        .update(messages)
        .set({ nextAttemptAt: new Date("2000-01-01T00:00:00.000Z") })
        .where(eq(messages.id, fourth.id));
      const configuration = providerAwsSesConfiguration({
        environment: sesEnvironment,
        orgId,
      });
      assert.ok(configuration);
      const commands = [];
      const adapter = createAwsSesAdapter({
        client: {
          async send(command) {
            commands.push(command);
            return { MessageId: "010001-ses-postgres-proof" };
          },
        },
        configuration,
        now: () => new Date("2026-08-24T01:00:00.000Z"),
      });
      try {
        assert.deepEqual(
          await processNextMessage({
            adapter: {
              name: "aws-ses-integration",
              send: (message) => adapter.send(message),
            },
            deliveryModes: ["live"],
            now: () => new Date("2026-08-24T01:00:01.000Z"),
            store: postgresWorkerStore,
            workerId: "aws-ses-integration",
          }),
          { messageId: fourth.id, state: "sent" },
        );
      } finally {
        adapter.close();
      }
      assert.ok(commands[0] instanceof SendEmailCommand);
      const [sesMessage] = await db
        .select({
          providerMessageId: messages.providerMessageId,
          status: messages.status,
        })
        .from(messages)
        .where(eq(messages.id, fourth.id));
      assert.deepEqual(sesMessage, {
        providerMessageId: "010001-ses-postgres-proof",
        status: "sent",
      });

      const rows = await db
        .select({ id: messages.id, provider: messages.outboundProvider })
        .from(messages)
        .where(eq(messages.orgId, orgId));
      assert.deepEqual(
        new Map(rows.map((row) => [row.id, row.provider])),
        new Map([
          [first.id, "smtp"],
          [second.id, "cloudflare-email"],
          [third.id, "smtp"],
          [fourth.id, "aws-ses"],
        ]),
      );
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await integrationLock`SELECT pg_advisory_unlock(${190020})`;
        integrationLock.release();
      }
    }
  },
);
