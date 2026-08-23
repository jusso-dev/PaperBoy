import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generateApiKey } from "../src/lib/api-key-crypto.ts";
import {
  EmailError,
  emailRequestHash,
  normalizeIdempotencyKey,
  parseSendEmailInput,
} from "../src/lib/email-core.ts";
import { handleSendEmailRequest } from "../src/lib/email-http.ts";

const generated = generateApiKey("test");
const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "test",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const fixedNow = new Date("2026-08-23T11:00:00.000Z");

function testDependencies() {
  const idempotency = new Map();
  const queued = [];

  return {
    dependencies: {
      authenticate: async (request) =>
        request.headers.get("authorization") === `Bearer ${generated.rawKey}`
          ? principal
          : null,
      queue: async ({ idempotencyKey: rawKey, payload, principal: received }) => {
        const email = parseSendEmailInput(payload);
        const key = normalizeIdempotencyKey(rawKey);
        const hash = emailRequestHash(email);

        assert.deepEqual(received, principal);

        if (key && idempotency.has(key)) {
          const existing = idempotency.get(key);

          if (existing.hash !== hash) {
            throw new EmailError("IDEMPOTENCY_CONFLICT");
          }

          return { ...existing.message, replayed: true };
        }

        const message = {
          createdAt: fixedNow,
          deliveryMode: "test-sink",
          domainId: null,
          environment: "test",
          id: randomUUID(),
          replayed: false,
          status: "queued",
        };
        queued.push({ email, key, message });

        if (key) {
          idempotency.set(key, { hash, message });
        }

        return message;
      },
    },
    queued,
  };
}

function request(body, options = {}) {
  return new Request("http://paperboy.test/api/v1/emails", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${generated.rawKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    method: "POST",
  });
}

const validBody = {
  from: "PaperBoy <sender@example.com>",
  html: "<p>Hello</p>",
  subject: "Hello",
  tags: [{ name: "kind", value: "receipt" }],
  to: ["reader@example.net"],
};

test("a test bearer key queues one email and returns only its id", async () => {
  const { dependencies, queued } = testDependencies();
  const response = await handleSendEmailRequest(request(validBody), dependencies);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body), ["id"]);
  assert.match(body.id, /^[0-9a-f-]{36}$/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(queued.length, 1);
  assert.equal(queued[0].message.deliveryMode, "test-sink");
});

test("missing from and to returns JSON validation details with 422", async () => {
  const { dependencies, queued } = testDependencies();
  const response = await handleSendEmailRequest(
    request({ subject: "Missing addresses", text: "Body" }),
    dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error.code, "validation_error");
  assert.deepEqual(
    body.error.fields.map((field) => field.field),
    ["from", "to"],
  );
  assert.equal(queued.length, 0);
});

test("Idempotency-Key replays the same id and rejects a changed body", async () => {
  const { dependencies, queued } = testDependencies();
  const headers = { "Idempotency-Key": "receipt-order-123" };
  const first = await handleSendEmailRequest(
    request(validBody, { headers }),
    dependencies,
  );
  const replay = await handleSendEmailRequest(
    request(validBody, { headers }),
    dependencies,
  );
  const conflict = await handleSendEmailRequest(
    request({ ...validBody, subject: "Changed" }, { headers }),
    dependencies,
  );

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal((await first.json()).id, (await replay.json()).id);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "idempotency_conflict");
  assert.equal(queued.length, 1);
});

test("invalid JSON and an invalid bearer key fail without queueing", async () => {
  const { dependencies, queued } = testDependencies();
  const invalidJson = await handleSendEmailRequest(
    request("{not-json"),
    dependencies,
  );
  const unauthorized = await handleSendEmailRequest(
    request(validBody, { headers: { Authorization: "Bearer invalid" } }),
    dependencies,
  );

  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, "invalid_json");
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("WWW-Authenticate"), /Bearer/);
  assert.equal(queued.length, 0);
});
