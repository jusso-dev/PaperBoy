import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  EmailError,
  emailRequestHash,
  normalizeIdempotencyKey,
  parseSendEmailInput,
} from "../src/lib/email-core.ts";

test("Resend-shaped email input is normalized without building MIME", () => {
  const parsed = parseSendEmailInput({
    from: "PaperBoy <News@münchen.example>",
    html: "<p>Hello</p>",
    subject: "Morning edition",
    tags: [{ name: "edition", value: "morning_1" }],
    text: "Hello",
    to: "Reader <reader@example.com>",
  });

  assert.deepEqual(parsed, {
    attachments: [],
    bcc: [],
    cc: [],
    from: "PaperBoy <News@xn--mnchen-3ya.example>",
    fromAddress: "News@xn--mnchen-3ya.example",
    fromDomain: "xn--mnchen-3ya.example",
    headers: {},
    html: "<p>Hello</p>",
    replyTo: [],
    scheduledAt: null,
    subject: "Morning edition",
    tags: [{ name: "edition", value: "morning_1" }],
    text: "Hello",
    to: ["Reader <reader@example.com>"],
  });
  assert.deepEqual(Object.keys(parsed).sort(), [
    "attachments",
    "bcc",
    "cc",
    "from",
    "fromAddress",
    "fromDomain",
    "headers",
    "html",
    "replyTo",
    "scheduledAt",
    "subject",
    "tags",
    "text",
    "to",
  ]);
  assert.equal("rawMime" in parsed, false);
  assert.equal("date" in parsed, false);
  assert.equal("dkimSignature" in parsed, false);
});

test("missing from and to return field-specific validation issues", () => {
  assert.throws(
    () => parseSendEmailInput({ subject: "Hello", text: "Body" }),
    (error) => {
      assert.equal(error instanceof EmailError, true);
      assert.equal(error.code, "VALIDATION_ERROR");
      assert.deepEqual(
        error.issues.map((issue) => issue.field),
        ["from", "to"],
      );
      return true;
    },
  );
});

test("header injection is rejected while attachments are a supported field", () => {
  assert.throws(
    () =>
      parseSendEmailInput({
        attachments: [],
        from: "sender@example.com\r\nBcc: victim@example.com",
        html: "<p>Hello</p>",
        subject: "Hello\r\nX-Test: injected",
        to: ["reader@example.com"],
      }),
    (error) => {
      assert.equal(error instanceof EmailError, true);
      assert.deepEqual(
        new Set(error.issues.map((issue) => issue.field)),
        new Set(["from", "subject"]),
      );
      return true;
    },
  );
});

test("idempotency keys and canonical request hashes are deterministic", () => {
  const first = parseSendEmailInput({
    from: "sender@example.com",
    subject: "Hello",
    tags: [{ name: "kind", value: "receipt" }],
    text: "Body",
    to: ["one@example.com", "two@example.com"],
  });
  const second = parseSendEmailInput({
    from: "sender@example.com",
    subject: "Hello",
    tags: [{ name: "kind", value: "receipt" }],
    text: "Body",
    to: ["one@example.com", "two@example.com"],
  });

  assert.equal(normalizeIdempotencyKey("order-123"), "order-123");
  assert.equal(normalizeIdempotencyKey(null), null);
  assert.equal(emailRequestHash(first), emailRequestHash(second));
  assert.equal(
    emailRequestHash(first),
    createHash("sha256")
      .update(
        JSON.stringify({
          from: first.from,
          html: first.html,
          replyTo: first.replyTo,
          cc: first.cc,
          bcc: first.bcc,
          headers: first.headers,
          scheduledAt: first.scheduledAt?.toISOString() ?? null,
          subject: first.subject,
          tags: first.tags,
          text: first.text,
          to: first.to,
        }),
      )
      .digest("hex"),
  );
  assert.match(emailRequestHash(first), /^[0-9a-f]{64}$/);
  assert.throws(() => normalizeIdempotencyKey("contains a space"), EmailError);
});

test("reply_to accepts a plus-address used by support desks", () => {
  const parsed = parseSendEmailInput({
    from: "Acme <hello@snagspot.app>",
    reply_to: "reply+abc123@mail.snagspot.test",
    subject: "Re: ticket",
    text: "We are looking into it.",
    to: "jane@example.com",
  });

  assert.deepEqual(parsed.replyTo, ["reply+abc123@mail.snagspot.test"]);
});

test("cc, bcc, and custom headers are accepted with a combined recipient cap", () => {
  const parsed = parseSendEmailInput({
    bcc: "audit@example.com",
    cc: ["Desk <desk@example.com>", "second@example.com"],
    from: "sender@example.com",
    headers: { "X-Campaign": "morning", "List-Unsubscribe": "<https://example.com/unsub>" },
    subject: "Hello",
    text: "Body",
    to: "reader@example.com",
  });

  assert.deepEqual(parsed.cc, ["Desk <desk@example.com>", "second@example.com"]);
  assert.deepEqual(parsed.bcc, ["audit@example.com"]);
  assert.deepEqual(parsed.headers, {
    "X-Campaign": "morning",
    "List-Unsubscribe": "<https://example.com/unsub>",
  });

  assert.throws(
    () =>
      parseSendEmailInput({
        bcc: Array.from({ length: 25 }, (_, index) => `b${index}@example.com`),
        cc: Array.from({ length: 25 }, (_, index) => `c${index}@example.com`),
        from: "sender@example.com",
        subject: "Hello",
        text: "Body",
        to: ["a@example.com"],
      }),
    (error) =>
      error instanceof EmailError &&
      error.issues.some((issue) => issue.field === "to"),
  );
});

test("reserved and malformed headers are rejected", () => {  for (const headers of [
    { Bcc: "smuggled@example.com" },
    { Subject: "override" },
    { "X-PaperBoy-Internal": "nope" },
    { "Bad Header": "space in name" },
    { "X-Ok": "line one\r\nline two" },
  ]) {
    assert.throws(
      () =>
        parseSendEmailInput({
          from: "sender@example.com",
          headers,
          subject: "Hello",
          text: "Body",
          to: "reader@example.com",
        }),
      EmailError,
    );
  }
});

test("scheduled_at accepts a future ISO instant and normalises the past", () => {
  const now = new Date("2026-09-05T07:00:00.000Z");
  const future = parseSendEmailInput(
    {
      from: "sender@example.com",
      scheduled_at: "2026-09-06T01:30:00Z",
      subject: "Hello",
      text: "Body",
      to: "reader@example.com",
    },
    { now },
  );
  assert.equal(future.scheduledAt?.toISOString(), "2026-09-06T01:30:00.000Z");

  const past = parseSendEmailInput(
    {
      from: "sender@example.com",
      scheduled_at: "2026-09-04T01:30:00Z",
      subject: "Hello",
      text: "Body",
      to: "reader@example.com",
    },
    { now },
  );
  assert.equal(past.scheduledAt, null);

  for (const scheduled_at of [
    "tomorrow at noon",
    "2026-09-06 01:30:00",
    "not a date",
    123,
    "2028-09-06T01:30:00Z",
  ]) {
    assert.throws(
      () =>
        parseSendEmailInput(
          {
            from: "sender@example.com",
            scheduled_at,
            subject: "Hello",
            text: "Body",
            to: "reader@example.com",
          },
          { now },
        ),
      (error) =>
        error instanceof EmailError &&
        error.issues.some((issue) => issue.field === "scheduled_at"),
    );
  }
});
