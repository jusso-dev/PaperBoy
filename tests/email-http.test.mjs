import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generateApiKey } from "../src/lib/api-key-crypto.ts";
import { AttachmentStorageError } from "../src/lib/attachment-storage.ts";
import {
  EmailError,
  emailRequestHash,
  normalizeIdempotencyKey,
  parseSendEmailInput,
} from "../src/lib/email-core.ts";
import { handleSendEmailRequest } from "../src/lib/email-http.ts";
import { OpenTrackingConfigurationError } from "../src/lib/open-tracking-core.ts";
import { RateLimitError } from "../src/lib/rate-limit-core.ts";
import { TemplateError } from "../src/lib/template-core.ts";

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

test("header and JSON idempotency keys replay one send", async () => {
  const { dependencies, queued } = testDependencies();
  const key = "receipt-order-123";
  const first = await handleSendEmailRequest(
    request({ ...validBody, idempotency_key: key }),
    dependencies,
  );
  const replay = await handleSendEmailRequest(
    request(validBody, { headers: { "Idempotency-Key": key } }),
    dependencies,
  );
  const matchingHeaderAndBody = await handleSendEmailRequest(
    request(
      { ...validBody, idempotency_key: key },
      { headers: { "Idempotency-Key": key } },
    ),
    dependencies,
  );
  const conflict = await handleSendEmailRequest(
    request(
      { ...validBody, idempotency_key: key, subject: "Changed" },
    ),
    dependencies,
  );

  assert.equal(first.status, 200);
  assert.equal(replay.status, 200);
  assert.equal(matchingHeaderAndBody.status, 200);
  const firstId = (await first.json()).id;
  assert.equal(firstId, (await replay.json()).id);
  assert.equal(firstId, (await matchingHeaderAndBody.json()).id);
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "idempotency_conflict");
  assert.equal(queued.length, 1);
});

test("header and JSON idempotency keys must match", async () => {
  const { dependencies, queued } = testDependencies();
  const response = await handleSendEmailRequest(
    request(
      { ...validBody, idempotency_key: "body-key" },
      { headers: { "Idempotency-Key": "header-key" } },
    ),
    dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error.code, "validation_error");
  assert.deepEqual(body.error.fields, [
    {
      field: "idempotency_key",
      message: "Must match the Idempotency-Key header when both are provided.",
    },
  ]);
  assert.equal(queued.length, 0);
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

test("oversized attachment errors return 413", async () => {
  const { dependencies } = testDependencies();
  dependencies.queue = async () => {
    throw new EmailError("ATTACHMENTS_TOO_LARGE");
  };
  const response = await handleSendEmailRequest(
    request(validBody),
    dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 413);
  assert.equal(body.error.code, "attachment_size_exceeded");
  assert.deepEqual(body.error.fields, [
    {
      field: "attachments",
      message: "Attachments must total at most 10 MiB.",
    },
  ]);
});

test("suppressed recipients return an actionable reason without queueing", async () => {
  const { dependencies, queued } = testDependencies();
  dependencies.queue = async () => {
    throw new EmailError("RECIPIENT_SUPPRESSED", [
      {
        field: "to.0",
        message: "Recipient is suppressed after a permanent bounce.",
      },
    ]);
  };
  const response = await handleSendEmailRequest(request(validBody), dependencies);
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error.code, "recipient_suppressed");
  assert.match(body.error.fields[0].message, /permanent bounce/);
  assert.equal(queued.length, 0);
});

test("private attachment storage failures return an actionable 503", async () => {
  const { dependencies } = testDependencies();
  dependencies.queue = async () => {
    throw new AttachmentStorageError("WRITE_FAILED");
  };
  const response = await handleSendEmailRequest(
    request(validBody),
    dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "attachment_storage_unavailable");
  assert.equal(JSON.stringify(body).includes("WRITE_FAILED"), false);
});

test("enabled tracking without operator secrets fails before queueing", async () => {
  const { dependencies } = testDependencies();
  dependencies.queue = async () => {
    throw new OpenTrackingConfigurationError();
  };
  const response = await handleSendEmailRequest(request(validBody), dependencies);
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.error.code, "open_tracking_unavailable");
  assert.match(body.error.message, /dedicated open-tracking signing key/);
});

test("a capped organization receives 429 with an exact Retry-After", async () => {
  const { dependencies } = testDependencies();
  dependencies.queue = async () => {
    throw new RateLimitError("live", 60, 37);
  };
  const response = await handleSendEmailRequest(request(validBody), dependencies);
  const body = await response.json();

  assert.equal(response.status, 429);
  assert.equal(response.headers.get("Retry-After"), "37");
  assert.deepEqual(body.error, {
    code: "rate_limit_exceeded",
    environment: "live",
    limit: 60,
    message:
      "This organization reached its live send limit. Retry after 37 seconds.",
    retry_after_seconds: 37,
  });
});

test("an unknown organization template returns 404", async () => {
  const { dependencies } = testDependencies();
  dependencies.queue = async () => {
    throw new TemplateError("TEMPLATE_NOT_FOUND");
  };
  const response = await handleSendEmailRequest(
    request({
      from: "sender@example.com",
      template_id: "33333333-3333-4333-8333-333333333333",
      to: "reader@example.net",
    }),
    dependencies,
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "template_not_found");
});

test("missing required template variables return field-level 422 details", async () => {
  const { dependencies } = testDependencies();
  dependencies.queue = async () => {
    throw new TemplateError("MISSING_REQUIRED_VARIABLES", [
      {
        field: "data.reader.name",
        message: "This required template variable is missing.",
      },
    ]);
  };
  const response = await handleSendEmailRequest(request(validBody), dependencies);
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error.code, "missing_template_variables");
  assert.deepEqual(body.error.fields, [
    {
      field: "data.reader.name",
      message: "This required template variable is missing.",
    },
  ]);
});
