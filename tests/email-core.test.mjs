import assert from "node:assert/strict";
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
    from: "PaperBoy <News@xn--mnchen-3ya.example>",
    fromAddress: "News@xn--mnchen-3ya.example",
    fromDomain: "xn--mnchen-3ya.example",
    html: "<p>Hello</p>",
    subject: "Morning edition",
    tags: [{ name: "edition", value: "morning_1" }],
    text: "Hello",
    to: ["Reader <reader@example.com>"],
  });
  assert.deepEqual(Object.keys(parsed).sort(), [
    "from",
    "fromAddress",
    "fromDomain",
    "html",
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

test("header injection and out-of-scope fields are rejected", () => {
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
        new Set(["attachments", "from", "subject"]),
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
  assert.match(emailRequestHash(first), /^[0-9a-f]{64}$/);
  assert.throws(() => normalizeIdempotencyKey("contains a space"), EmailError);
});
