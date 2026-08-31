import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EmailError } from "../src/lib/email-core.ts";
import {
  inboundRecipientDomains,
  inboundSinkholeReasonFromPayload,
  parseInboundEmailInput,
  parseInboundMime,
} from "../src/lib/inbound-core.ts";
import { receivedEmailWebhookBody } from "../src/lib/webhook-core.ts";

const raw = [
  "From: Jane <jane@example.com>",
  "To: Acme <reply+abc123@mail.snagspot.test>",
  "Subject: Re: My ticket",
  "Message-ID: <orig@example.com>",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "The printer is still jammed.",
  "",
].join("\r\n");

test("inbound MIME keeps the plus-address used by support desks", async () => {
  const parsed = await parseInboundMime(raw);
  assert.equal(parsed.from, "Jane <jane@example.com>");
  assert.deepEqual(parsed.to, ["Acme <reply+abc123@mail.snagspot.test>"]);
  assert.equal(parsed.subject, "Re: My ticket");
  assert.equal(parsed.text?.includes("printer"), true);
  assert.equal(parsed.rfc822MessageId, "orig@example.com");
  assert.deepEqual(inboundRecipientDomains(parsed.to), ["mail.snagspot.test"]);
});

test("inbound JSON accepts the same Resend-shaped receive fields", async () => {
  const parsed = await parseInboundEmailInput({
    from: "jane@example.com",
    html: "<p>Still broken</p>",
    message_id: "<orig@example.com>",
    subject: "Re: My ticket",
    text: "Still broken",
    to: ["reply+abc123@mail.snagspot.test"],
  });

  assert.equal(parsed.from, "jane@example.com");
  assert.deepEqual(parsed.to, ["reply+abc123@mail.snagspot.test"]);
  assert.equal(parsed.rfc822MessageId, "orig@example.com");
});

test("malformed inbound MIME fails closed", async () => {
  await assert.rejects(
    () => parseInboundMime("this is not an email"),
    (error) => {
      assert.equal(error instanceof EmailError, true);
      return true;
    },
  );
});

test("email.received webhook includes routing addresses but not the body", () => {
  const body = receivedEmailWebhookBody({
    createdAt: new Date("2026-08-26T00:00:00.000Z"),
    environment: "live",
    from: "jane@example.com",
    messageId: "orig@example.com",
    receivedEmailId: "11111111-1111-4111-8111-111111111111",
    subject: "Re: My ticket",
    to: ["reply+abc123@mail.snagspot.test"],
  });
  const parsed = JSON.parse(body);
  assert.equal(parsed.type, "email.received");
  assert.deepEqual(parsed.data.to, ["reply+abc123@mail.snagspot.test"]);
  assert.equal(parsed.data.email_id, "11111111-1111-4111-8111-111111111111");
  assert.equal("text" in parsed.data, false);
  assert.equal("html" in parsed.data, false);
});

test("returned auto-replies and bounce reports fall into the inbound sinkhole", async () => {
  const hardBounce = await readFile(
    new URL("fixtures/feedback/hard-bounce.eml", import.meta.url),
    "utf8",
  );
  const outOfOffice = [
    "From: Jane <jane@example.com>",
    "To: hello@mail.snagspot.test",
    "Subject: Automatic reply: Re: Your ticket",
    "Auto-Submitted: auto-replied",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "I am out of the office.",
    "",
  ].join("\r\n");

  assert.equal(inboundSinkholeReasonFromPayload({ email: hardBounce }), "bounce");
  assert.equal(inboundSinkholeReasonFromPayload({ email: outOfOffice }), "auto_reply");
  assert.equal(
    inboundSinkholeReasonFromPayload({
      from: "MAILER-DAEMON@example.net",
      subject: "Undeliverable: Invoice",
      text: "The following message to <dead@example.net> was undeliverable.",
      to: "hello@mail.snagspot.test",
    }),
    "bounce",
  );
  assert.equal(
    inboundSinkholeReasonFromPayload({
      from: "jane@example.com",
      subject: "Out of Office: next week",
      text: "I am away.",
      to: "hello@mail.snagspot.test",
    }),
    "auto_reply",
  );
  assert.equal(inboundSinkholeReasonFromPayload({ email: raw }), null);
  assert.equal(
    inboundSinkholeReasonFromPayload({
      from: "jane@example.com",
      subject: "Re: My ticket",
      text: "The printer is still jammed.",
      to: "reply+abc123@mail.snagspot.test",
    }),
    null,
  );
});

test("email.received webhook strips display names so plus-address matching works", async () => {
  const inbound = await parseInboundMime(raw);
  const body = JSON.parse(
    receivedEmailWebhookBody({
      createdAt: new Date("2026-08-26T00:00:00.000Z"),
      environment: "live",
      from: inbound.from,
      messageId: inbound.rfc822MessageId,
      receivedEmailId: "11111111-1111-4111-8111-111111111111",
      subject: inbound.subject,
      to: inbound.to,
    }),
  );

  assert.equal(body.data.from, "jane@example.com");
  assert.deepEqual(body.data.to, ["reply+abc123@mail.snagspot.test"]);
});
