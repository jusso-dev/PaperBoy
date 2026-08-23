import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test(
  "parallel HTTP idempotency is API-key scoped and expires after 24 hours",
  { skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured" },
  async () => {
    process.env.DATABASE_URL = databaseUrl;
    const [
      { and, eq },
      { db },
      { apiKeys, messages, orgs, users },
      { generateApiKey },
      { handleSendEmailRequest },
      { queueEmail },
    ] = await Promise.all([
      import("drizzle-orm"),
      import("../src/db/index.ts"),
      import("../src/db/schema.ts"),
      import("../src/lib/api-key-crypto.ts"),
      import("../src/lib/email-http.ts"),
      import("../src/lib/messages.ts"),
    ]);
    const orgId = randomUUID();
    const userId = `idempotency-user-${randomUUID()}`;
    const firstKey = generateApiKey("test");
    const secondKey = generateApiKey("test");
    const firstApiKeyId = randomUUID();
    const secondApiKeyId = randomUUID();
    const principals = new Map([
      [
        firstKey.rawKey,
        {
          actorUserId: userId,
          apiKeyId: firstApiKeyId,
          environment: "test",
          orgId,
        },
      ],
      [
        secondKey.rawKey,
        {
          actorUserId: userId,
          apiKeyId: secondApiKeyId,
          environment: "test",
          orgId,
        },
      ],
    ]);
    const dependencies = {
      authenticate: async (request) => {
        const authorization = request.headers.get("authorization");
        return authorization?.startsWith("Bearer ")
          ? principals.get(authorization.slice("Bearer ".length)) ?? null
          : null;
      },
      queue: queueEmail,
    };
    const request = (body, rawKey, headers = {}) =>
      new Request("https://paperboy.test/api/v1/emails", {
        body: JSON.stringify(body),
        headers: {
          Authorization: `Bearer ${rawKey}`,
          "Content-Type": "application/json",
          ...headers,
        },
        method: "POST",
      });
    const payload = {
      from: "news@example.com",
      subject: "Parallel proof",
      text: "One provider-neutral message.",
      to: "reader@example.net",
    };
    const idempotencyKey = `parallel-${randomUUID()}`;
    const integrationLock = await db.$client.connect();

    await integrationLock.query("SELECT pg_advisory_lock($1)", [190029]);
    try {
      await db.insert(orgs).values({ id: orgId, name: "Idempotency tenant" });
      await db.insert(users).values({
        email: `${randomUUID()}@example.com`,
        id: userId,
        name: "Idempotency operator",
        timezone: "Australia/Sydney",
      });
      await db.insert(apiKeys).values([
        {
          createdByUserId: userId,
          environment: "test",
          id: firstApiKeyId,
          keyHash: firstKey.keyHash,
          keyId: firstKey.keyId,
          name: "First key",
          orgId,
        },
        {
          createdByUserId: userId,
          environment: "test",
          id: secondApiKeyId,
          keyHash: secondKey.keyHash,
          keyId: secondKey.keyId,
          name: "Second key",
          orgId,
        },
      ]);

      const [headerResponse, jsonResponse] = await Promise.all([
        handleSendEmailRequest(
          request(payload, firstKey.rawKey, {
            "Idempotency-Key": idempotencyKey,
          }),
          dependencies,
        ),
        handleSendEmailRequest(
          request(
            { ...payload, idempotency_key: idempotencyKey },
            firstKey.rawKey,
          ),
          dependencies,
        ),
      ]);
      const [headerBody, jsonBody] = await Promise.all([
        headerResponse.json(),
        jsonResponse.json(),
      ]);

      assert.equal(headerResponse.status, 200);
      assert.equal(jsonResponse.status, 200);
      assert.equal(headerBody.id, jsonBody.id);
      assert.equal(
        (
          await db
            .select({ id: messages.id })
            .from(messages)
            .where(
              and(
                eq(messages.apiKeyId, firstApiKeyId),
                eq(messages.idempotencyKey, idempotencyKey),
              ),
            )
        ).length,
        1,
      );

      const conflict = await handleSendEmailRequest(
        request(
          { ...payload, subject: "Conflicting body" },
          firstKey.rawKey,
          { "Idempotency-Key": idempotencyKey },
        ),
        dependencies,
      );
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json()).error.code, "idempotency_conflict");

      const otherKeyResponse = await handleSendEmailRequest(
        request(
          { ...payload, subject: "Other API key" },
          secondKey.rawKey,
          { "Idempotency-Key": idempotencyKey },
        ),
        dependencies,
      );
      assert.equal(otherKeyResponse.status, 200);
      assert.notEqual((await otherKeyResponse.json()).id, headerBody.id);

      await db
        .update(messages)
        .set({ createdAt: new Date("2000-01-01T00:00:00.000Z") })
        .where(eq(messages.id, headerBody.id));
      const expiredReuse = await handleSendEmailRequest(
        request(
          { ...payload, subject: "Reused after expiry" },
          firstKey.rawKey,
          { "Idempotency-Key": idempotencyKey },
        ),
        dependencies,
      );
      const expiredReuseBody = await expiredReuse.json();
      assert.equal(expiredReuse.status, 200);
      assert.notEqual(expiredReuseBody.id, headerBody.id);

      const firstKeyRows = await db
        .select({
          id: messages.id,
          idempotencyKey: messages.idempotencyKey,
          requestHash: messages.requestHash,
        })
        .from(messages)
        .where(eq(messages.apiKeyId, firstApiKeyId));
      assert.equal(firstKeyRows.length, 2);
      const expiredRow = firstKeyRows.find((row) => row.id === headerBody.id);
      const activeRow = firstKeyRows.find(
        (row) => row.id === expiredReuseBody.id,
      );
      assert.deepEqual(expiredRow, {
        id: headerBody.id,
        idempotencyKey: null,
        requestHash: null,
      });
      assert.equal(activeRow?.idempotencyKey, idempotencyKey);
      assert.match(activeRow?.requestHash ?? "", /^[0-9a-f]{64}$/);
    } finally {
      try {
        await db.delete(orgs).where(eq(orgs.id, orgId));
        await db.delete(users).where(eq(users.id, userId));
      } finally {
        await integrationLock.query("SELECT pg_advisory_unlock($1)", [190029]);
        integrationLock.release();
        await db.$client.end();
      }
    }
  },
);
