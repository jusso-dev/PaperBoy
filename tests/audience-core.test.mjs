import assert from "node:assert/strict";
import test from "node:test";
import {
  AudienceError,
  parseContactCsv,
  parseCreateAudienceInput,
  parseCreateContactInput,
  parseUpdateContactInput,
} from "../src/lib/audience-core.ts";
import {
  createUnsubscribeToken,
  createUnsubscribeUrl,
  parseUnsubscribeSigningKey,
  verifyUnsubscribeToken,
  withUnsubscribeFooter,
} from "../src/lib/unsubscribe-core.ts";

const contactId = "33333333-3333-4333-8333-333333333333";
const key = Buffer.alloc(32, 7);

test("unsubscribe signing accepts canonical base64 and base64url keys", () => {
  assert.deepEqual(parseUnsubscribeSigningKey(key.toString("base64")), key);
  assert.deepEqual(parseUnsubscribeSigningKey(key.toString("base64url")), key);
  assert.throws(
    () => parseUnsubscribeSigningKey("not-a-signing-key"),
    /unsubscribe signing is unavailable/i,
  );
});

test("audience and contact input normalize bounded names and plain addresses", () => {
  assert.deepEqual(parseCreateAudienceInput({ name: " Weekly readers " }), {
    name: "Weekly readers",
  });
  assert.deepEqual(
    parseCreateContactInput({ email: " Reader@Example.NET ", name: " Ada " }),
    { email: "reader@example.net", name: "Ada" },
  );
  assert.deepEqual(parseUpdateContactInput({ name: "" }), { name: null });
});

test("contact CSV validates atomically, supports quotes, and deduplicates by normalized email", () => {
  const parsed = parseContactCsv(
    '\uFEFFemail,name\r\nReader@Example.NET,"Ada, A."\r\nreader@example.net,Ada Lovelace\r\nsecond@example.net,\r\n',
  );
  assert.equal(parsed.inputRows, 3);
  assert.deepEqual(parsed.rows, [
    { email: "reader@example.net", name: "Ada Lovelace" },
    { email: "second@example.net", name: null },
  ]);

  for (const csv of [
    "address\nreader@example.net\n",
    "email,name\ngood@example.net,Ada\nnot-an-email,Bad\n",
    'email,name\n"unterminated,Ada\n',
  ]) {
    assert.throws(
      () => parseContactCsv(csv),
      (error) => error instanceof AudienceError && error.code === "VALIDATION_ERROR",
    );
  }
});

test("contact CSV has no fixed row-count cap", () => {
  const rows = Array.from(
    { length: 1_000 },
    (_, index) => `reader-${index}@example.net`,
  );
  const parsed = parseContactCsv(`email\n${rows.join("\n")}`);
  assert.equal(parsed.inputRows, 1_000);
  assert.equal(parsed.rows.length, 1_000);
});

test("only an untampered PaperBoy unsubscribe token verifies", () => {
  const token = createUnsubscribeToken({ contactId, key });
  assert.equal(verifyUnsubscribeToken({ key, token }), contactId);

  const parts = token.split(".");
  const payloadCharacter = parts[1].at(-1);
  const tamperedPayload = `${parts[0]}.${parts[1].slice(0, -1)}${payloadCharacter === "A" ? "B" : "A"}.${parts[2]}`;
  const finalCharacter = token.at(-1);
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const finalIndex = alphabet.indexOf(finalCharacter);
  assert.equal(finalIndex % 4, 0);
  const nonCanonicalAlias = alphabet[finalIndex + 1];
  const tamperedSignature = `${token.slice(0, -1)}${nonCanonicalAlias}`;
  assert.equal(verifyUnsubscribeToken({ key, token: tamperedPayload }), null);
  assert.equal(verifyUnsubscribeToken({ key, token: tamperedSignature }), null);
  assert.equal(verifyUnsubscribeToken({ key, token: `${token}.extra` }), null);
});

test("unsubscribe URLs and fallback footers are provider-neutral", () => {
  const url = createUnsubscribeUrl({
    baseUrl: "https://paperboy.example/base",
    contactId,
    key,
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://paperboy.example");
  assert.equal(parsed.pathname, "/unsubscribe");
  assert.equal(
    verifyUnsubscribeToken({ key, token: parsed.searchParams.get("token") }),
    contactId,
  );
  assert.deepEqual(
    withUnsubscribeFooter({ html: "<p>Hello</p>", text: "Hello" }),
    {
      html: '<p>Hello</p>\n<p><a href="{{unsubscribe_url}}">Unsubscribe</a></p>',
      text: "Hello\n\nUnsubscribe: {{unsubscribe_url}}",
    },
  );
  assert.equal(
    withUnsubscribeFooter({ html: "{{unsubscribe_url}}", text: null }).html,
    "{{unsubscribe_url}}",
  );
});
