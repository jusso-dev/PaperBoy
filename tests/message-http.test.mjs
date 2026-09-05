import assert from "node:assert/strict";
import test from "node:test";
import { MessageStatusError } from "../src/lib/message-status-core.ts";
import {
  handleGetMessageRequest,
  handleListMessageEventsRequest,
} from "../src/lib/message-http.ts";

const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "test",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const messageId = "22222222-2222-4222-8222-222222222222";

function request(authorized = true) {
  return new Request(`http://paperboy.test/api/v1/emails/${messageId}`, {
    headers: authorized ? { Authorization: "Bearer test-key" } : {},
  });
}

function detail() {
  return {
    attachments: [
      {
        contentId: null,
        contentType: "application/pdf",
        filename: "invoice.pdf",
        id: "33333333-3333-4333-8333-333333333333",
        position: 0,
        size: 123,
      },
    ],
    bcc: [],
    cc: [],
    attemptCount: 1,
    createdAt: new Date("2026-08-23T10:00:00.000Z"),
    deliveryMode: "test-sink",
    domainId: "66666666-6666-4666-8666-666666666666",
    environment: "test",
    failedAt: null,
    failureReason: null,
    from: "PaperBoy <news@example.com>",
    headers: { "X-Edition": "morning" },
    html: "<p>Edition</p>",
    id: messageId,
    lastAttemptAt: new Date("2026-08-23T10:01:00.000Z"),
    lastErrorCode: null,
    leaseExpiresAt: null,
    nextAttemptAt: null,
    openTrackingEnabled: false,
    clickTrackingEnabled: false,
    provider: "test-sink",
    sentAt: new Date("2026-08-23T10:01:00.000Z"),
    status: "sent",
    subject: "Morning edition",
    tags: [{ name: "edition", value: "morning" }],
    text: "Edition",
    to: ["reader@example.net"],
    updatedAt: new Date("2026-08-23T10:01:00.000Z"),
  };
}

function dependencies(overrides = {}) {
  return {
    authenticate: async (received) =>
      received.headers.get("authorization") ? principal : null,
    services: {
      get: async () => detail(),
      listEvents: async () => [
        {
          createdAt: new Date("2026-08-23T10:00:00.000Z"),
          data: {},
          id: "44444444-4444-4444-8444-444444444444",
          messageId,
          sequence: 1,
          type: "queued",
        },
        {
          createdAt: new Date("2026-08-23T10:01:00.000Z"),
          data: {},
          id: "55555555-5555-4555-8555-555555555555",
          messageId,
          sequence: 2,
          type: "delivered",
        },
      ],
      ...overrides,
    },
  };
}

test("GET email returns tenant service data with explicit UTC timestamps", async () => {
  let context;
  const deps = dependencies({
    async get(receivedPrincipal, receivedId) {
      context = [receivedPrincipal, receivedId];
      return detail();
    },
  });
  const response = await handleGetMessageRequest(request(), messageId, deps);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(context, [principal, messageId]);
  assert.equal(body.id, messageId);
  assert.equal(body.object, "email");
  assert.equal(body.status, "sent");
  assert.equal(body.domain_id, "66666666-6666-4666-8666-666666666666");
  assert.equal(body.created_at, "2026-08-23T10:00:00.000Z");
  assert.equal(body.sent_at, "2026-08-23T10:01:00.000Z");
  assert.equal(body.open_tracking_enabled, false);
  assert.equal(body.provider, "test-sink");
  assert.deepEqual(body.attachments, [
    {
      content_id: null,
      content_type: "application/pdf",
      filename: "invoice.pdf",
      id: "33333333-3333-4333-8333-333333333333",
      size: 123,
    },
  ]);
  assert.deepEqual(body.cc, []);
  assert.deepEqual(body.bcc, []);
  assert.deepEqual(body.headers, { "X-Edition": "morning" });
  assert.equal(JSON.stringify(body).includes("storageKey"), false);
});

test("GET email events preserves the ordered UTC timeline", async () => {
  const response = await handleListMessageEventsRequest(
    request(),
    messageId,
    dependencies(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(
    body.data.map((event) => [event.type, event.created_at]),
    [
      ["queued", "2026-08-23T10:00:00.000Z"],
      ["delivered", "2026-08-23T10:01:00.000Z"],
    ],
  );
  assert.equal(body.data.some((event) => event.type === "opened"), false);
  assert.equal("sequence" in body.data[0], false);
});

test("message reads reject unauthenticated and hidden records", async () => {
  let called = false;
  const deps = dependencies({
    async get() {
      called = true;
      throw new MessageStatusError("MESSAGE_NOT_FOUND");
    },
    async listEvents() {
      throw new MessageStatusError("MESSAGE_NOT_FOUND");
    },
  });
  const unauthorized = await handleGetMessageRequest(
    request(false),
    messageId,
    deps,
  );
  const missing = await handleGetMessageRequest(request(), messageId, deps);
  const missingEvents = await handleListMessageEventsRequest(
    request(),
    messageId,
    deps,
  );

  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("WWW-Authenticate"), /Bearer/);
  assert.equal(called, true);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.code, "email_not_found");
  assert.equal(missingEvents.status, 404);
});
