import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { generateApiKey } from "../src/lib/api-key-crypto.ts";
import {
  handleGetReceivedEmailRequest,
  handleReceiveInboundEmailRequest,
} from "../src/lib/inbound-http.ts";

const generated = generateApiKey("test");
const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "test",
  orgId: "11111111-1111-4111-8111-111111111111",
};

function dependencies() {
  const received = [];
  return {
    received,
    services: {
      authenticate: async (request) =>
        request.headers.get("authorization") === `Bearer ${generated.rawKey}`
          ? principal
          : null,
      receive: async (_principal, payload) => {
        const record = {
          bcc: [],
          cc: [],
          createdAt: new Date("2026-08-26T00:00:00.000Z"),
          environment: "test",
          from: payload.from,
          html: payload.html ?? null,
          id: randomUUID(),
          messageId: payload.message_id ?? null,
          replayed: false,
          subject: payload.subject,
          text: payload.text ?? null,
          to: Array.isArray(payload.to) ? payload.to : [payload.to],
        };
        received.push(record);
        return record;
      },
      get: async (_principal, receivedEmailId) => ({
        bcc: [],
        cc: [],
        createdAt: new Date("2026-08-26T00:00:00.000Z"),
        environment: "test",
        from: "jane@example.com",
        html: null,
        id: receivedEmailId,
        messageId: "orig@example.com",
        replayed: false,
        subject: "Re: My ticket",
        text: "The printer is still jammed.",
        to: ["reply+abc123@mail.snagspot.test"],
      }),
    },
  };
}

test("inbound receive accepts a support-desk reply payload", async () => {
  const { received, services } = dependencies();
  const response = await handleReceiveInboundEmailRequest(
    new Request("http://paperboy.test/api/v1/received-emails", {
      body: JSON.stringify({
        from: "jane@example.com",
        subject: "Re: My ticket",
        text: "Still broken",
        to: "reply+abc123@mail.snagspot.test",
      }),
      headers: {
        Authorization: `Bearer ${generated.rawKey}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
    services,
  );

  assert.equal(response.status, 201);
  const body = await response.json();
  assert.equal(body.object, "email");
  assert.equal(typeof body.id, "string");
  assert.deepEqual(received[0].to, ["reply+abc123@mail.snagspot.test"]);
});

test("inbound get returns the fields a support desk fetches after email.received", async () => {
  const { services } = dependencies();
  const id = "11111111-1111-4111-8111-111111111111";
  const response = await handleGetReceivedEmailRequest(
    new Request(`http://paperboy.test/api/v1/received-emails/${id}`, {
      headers: { Authorization: `Bearer ${generated.rawKey}` },
    }),
    id,
    services,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    bcc: [],
    cc: [],
    created_at: "2026-08-26T00:00:00.000Z",
    from: "jane@example.com",
    html: null,
    id,
    message_id: "orig@example.com",
    object: "email",
    subject: "Re: My ticket",
    text: "The printer is still jammed.",
    to: ["reply+abc123@mail.snagspot.test"],
  });
});
