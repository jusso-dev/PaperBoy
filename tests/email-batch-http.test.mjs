import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generateApiKey } from "../src/lib/api-key-crypto.ts";
import { handleSendEmailBatchRequest } from "../src/lib/email-batch-http.ts";
import { parseSendEmailInput } from "../src/lib/email-core.ts";
import { RateLimitError } from "../src/lib/rate-limit-core.ts";

const generated = generateApiKey("test");
const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "test",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const fixedNow = new Date("2026-08-23T12:00:00.000Z");

function testDependencies() {
  const queued = [];
  let batchCalls = 0;

  return {
    dependencies: {
      authenticate: async (request) =>
        request.headers.get("authorization") === `Bearer ${generated.rawKey}`
          ? principal
          : null,
      queueBatch: async ({ payloads, principal: received }) => {
        batchCalls += 1;
        assert.deepEqual(received, principal);

        return Promise.all(
          payloads.map(async (payload) => {
            try {
              const email = parseSendEmailInput(payload);
              const message = {
                createdAt: fixedNow,
                deliveryMode: "test-sink",
                domainId: null,
                environment: "test",
                id: randomUUID(),
                replayed: false,
                status: "queued",
              };

              queued.push({ email, message });
              return { message, ok: true };
            } catch (error) {
              return { error, ok: false };
            }
          }),
        );
      },
    },
    get batchCalls() {
      return batchCalls;
    },
    queued,
  };
}

function request(body, options = {}) {
  return new Request("http://paperboy.test/api/v1/emails/batch", {
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      Authorization: `Bearer ${generated.rawKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
    method: "POST",
  });
}

function email(index) {
  return {
    from: "PaperBoy <sender@example.com>",
    subject: `Message ${index}`,
    text: `Body ${index}`,
    to: [`reader-${index}@example.net`],
  };
}

test("100 valid emails queue once and return ids in input order", async () => {
  const fixture = Array.from({ length: 100 }, (_, index) => email(index));
  const context = testDependencies();
  const response = await handleSendEmailBatchRequest(
    request(fixture),
    context.dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(context.batchCalls, 1);
  assert.equal(context.queued.length, 100);
  assert.equal(body.data.length, 100);
  assert.deepEqual(
    body.data.map((item) => item.id),
    context.queued.map((item) => item.message.id),
  );
  assert.deepEqual(
    context.queued.map((item) => item.email.subject),
    fixture.map((item) => item.subject),
  );
});

test("an invalid item reports its error without dropping valid neighbors", async () => {
  const context = testDependencies();
  const response = await handleSendEmailBatchRequest(
    request([
      email(0),
      { subject: "Missing addresses", text: "Body" },
      email(2),
    ]),
    context.dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 207);
  assert.equal(context.queued.length, 2);
  assert.equal(body.data.length, 3);
  assert.equal(body.data[0].id, context.queued[0].message.id);
  assert.equal(body.data[1].error.code, "validation_error");
  assert.deepEqual(
    body.data[1].error.fields.map((field) => field.field),
    ["from", "to"],
  );
  assert.equal(body.data[2].id, context.queued[1].message.id);
});

test("the batch envelope requires 1 to 100 email objects", async () => {
  const context = testDependencies();
  const responses = await Promise.all([
    handleSendEmailBatchRequest(request({ emails: [email(0)] }), context.dependencies),
    handleSendEmailBatchRequest(request([]), context.dependencies),
    handleSendEmailBatchRequest(
      request(Array.from({ length: 101 }, (_, index) => email(index))),
      context.dependencies,
    ),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [422, 422, 422],
  );
  assert.equal(context.batchCalls, 0);
  assert.deepEqual(
    await Promise.all(
      responses.map(async (response) => (await response.json()).error.code),
    ),
    ["batch_validation_error", "batch_validation_error", "batch_validation_error"],
  );
});

test("invalid JSON and an invalid bearer key fail before queueing", async () => {
  const context = testDependencies();
  const invalidJson = await handleSendEmailBatchRequest(
    request("{not-json"),
    context.dependencies,
  );
  const unauthorized = await handleSendEmailBatchRequest(
    request([email(0)], { headers: { Authorization: "Bearer invalid" } }),
    context.dependencies,
  );

  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, "invalid_json");
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("WWW-Authenticate"), /Bearer/);
  assert.equal(context.batchCalls, 0);
});

test("batch idempotency fails explicitly instead of being silently ignored", async () => {
  const context = testDependencies();
  const response = await handleSendEmailBatchRequest(
    request([email(0)], { headers: { "Idempotency-Key": "batch-123" } }),
    context.dependencies,
  );

  assert.equal(response.status, 422);
  assert.equal(
    (await response.json()).error.code,
    "batch_idempotency_not_supported",
  );
  assert.equal(context.batchCalls, 0);
});

test("batch rate limits preserve accepted neighbors and expose retry timing", async () => {
  const context = testDependencies();
  context.dependencies.queueBatch = async ({ payloads }) =>
    payloads.map((_, index) =>
      index === 0
        ? {
            message: {
              createdAt: fixedNow,
              deliveryMode: "test-sink",
              domainId: null,
              environment: "test",
              id: randomUUID(),
              replayed: false,
              status: "queued",
            },
            ok: true,
          }
        : { error: new RateLimitError("test", 600, 21), ok: false },
    );

  const mixed = await handleSendEmailBatchRequest(
    request([email(0), email(1)]),
    context.dependencies,
  );
  const mixedBody = await mixed.json();
  assert.equal(mixed.status, 207);
  assert.equal(mixed.headers.get("Retry-After"), "21");
  assert.equal(mixedBody.data[1].error.code, "rate_limit_exceeded");

  context.dependencies.queueBatch = async ({ payloads }) =>
    payloads.map(() => ({
      error: new RateLimitError("test", 600, 20),
      ok: false,
    }));
  const capped = await handleSendEmailBatchRequest(
    request([email(2), email(3)]),
    context.dependencies,
  );
  assert.equal(capped.status, 429);
  assert.equal(capped.headers.get("Retry-After"), "20");
});
