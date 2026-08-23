import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import {
  WebhookError,
  createWebhookSigningSecret,
  decryptWebhookSigningSecret,
  encryptWebhookSigningSecret,
  parseWebhookConfigurationInput,
  signWebhook,
  verifyWebhookSignature,
  webhookEventBody,
} from "../src/lib/webhook-core.ts";

const fixture = {
  body: '{"event_type":"ping","data":{"success":true}}',
  id: "msg_loFOjxBNrRLzqYUf",
  secret: "whsec_plJ3nmyCDGBKInavdOK15jsl",
  signature: "v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=",
  timestamp: 1731705121,
};

test("webhook signing matches the published Svix HMAC fixture", () => {
  assert.equal(signWebhook(fixture), fixture.signature);
  assert.equal(
    verifyWebhookSignature({
      body: fixture.body,
      headers: {
        "webhook-id": fixture.id,
        "webhook-signature": fixture.signature,
        "webhook-timestamp": String(fixture.timestamp),
      },
      now: new Date(fixture.timestamp * 1000),
      secret: fixture.secret,
    }),
    true,
  );
});

test("tampered bodies, stale timestamps, and wrong secrets fail verification", () => {
  const headers = {
    "webhook-id": fixture.id,
    "webhook-signature": fixture.signature,
    "webhook-timestamp": String(fixture.timestamp),
  };

  assert.equal(
    verifyWebhookSignature({
      body: `${fixture.body} `,
      headers,
      now: new Date(fixture.timestamp * 1000),
      secret: fixture.secret,
    }),
    false,
  );
  assert.equal(
    verifyWebhookSignature({
      body: fixture.body,
      headers,
      now: new Date((fixture.timestamp + 301) * 1000),
      secret: fixture.secret,
    }),
    false,
  );
  assert.equal(
    verifyWebhookSignature({
      body: fixture.body,
      headers,
      now: new Date(fixture.timestamp * 1000),
      secret: createWebhookSigningSecret(),
    }),
    false,
  );
});

test("signing secrets are context-bound encrypted and shown raw only at creation", () => {
  const context = {
    endpointId: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
  };
  const encryptionKey = Buffer.alloc(32, 7);
  const secret = createWebhookSigningSecret();
  const encryptedSecret = encryptWebhookSigningSecret({
    context,
    encryptionKey,
    secret,
  });

  assert.match(secret, /^whsec_/);
  assert.equal(encryptedSecret.includes(secret), false);
  assert.equal(
    decryptWebhookSigningSecret({
      context,
      encryptedSecret,
      encryptionKey,
    }),
    secret,
  );
  assert.throws(
    () =>
      decryptWebhookSigningSecret({
        context: { ...context, orgId: randomUUID() },
        encryptedSecret,
        encryptionKey,
      }),
    (error) =>
      error instanceof WebhookError && error.code === "SECRET_UNAVAILABLE",
  );
});

test("webhook URLs require HTTPS except explicit loopback development", () => {
  assert.deepEqual(
    parseWebhookConfigurationInput({ url: "https://hooks.example.com/events" }),
    { url: "https://hooks.example.com/events" },
  );
  assert.deepEqual(
    parseWebhookConfigurationInput(
      { url: "http://127.0.0.1:8080/events" },
      { allowInsecureLoopback: true },
    ),
    { url: "http://127.0.0.1:8080/events" },
  );

  for (const value of [
    { url: "http://hooks.example.com/events" },
    { url: "https://user:pass@hooks.example.com/events" },
    { url: "https://hooks.example.com/events#secret" },
    { url: "file:///tmp/webhook" },
    { extra: true, url: "https://hooks.example.com/events" },
  ]) {
    assert.throws(
      () => parseWebhookConfigurationInput(value),
      WebhookError,
    );
  }
});

test("event bodies are stable, content-free, and UTC", () => {
  const body = webhookEventBody({
    createdAt: new Date("2026-08-24T11:22:33.444+10:00"),
    environment: "live",
    messageId: "33333333-3333-4333-8333-333333333333",
    type: "delivered",
  });

  assert.deepEqual(JSON.parse(body), {
    created_at: "2026-08-24T01:22:33.444Z",
    data: {
      email_id: "33333333-3333-4333-8333-333333333333",
      environment: "live",
    },
    type: "email.delivered",
  });
  assert.equal(body.includes("recipient"), false);
  assert.equal(body.includes("subject"), false);
});
