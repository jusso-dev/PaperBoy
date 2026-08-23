import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import { dkimVerify } from "mailauth/lib/dkim/verify.js";
import {
  DkimError,
  createDkimSelector,
  decryptDkimPrivateKey,
  dkimDnsName,
  dkimDnsValue,
  encryptDkimPrivateKey,
  prepareCloudflareManagedMessage,
  prepareEncryptedDkimKey,
  signRawEmail,
} from "../src/lib/dkim-core.ts";

const fixedNow = new Date("2026-08-23T01:02:03.456Z");
const domainId = "11111111-1111-4111-8111-111111111111";
const keyId = "22222222-2222-4222-8222-222222222222";

test("DKIM private keys use authenticated, context-bound encryption", () => {
  const encryptionKey = randomBytes(32);
  const privateKey = "test-only private material";
  const encryptedPrivateKey = encryptDkimPrivateKey({
    context: { domainId, keyId },
    encryptionKey,
    privateKey,
  });

  assert.equal(encryptedPrivateKey.startsWith("v1."), true);
  assert.equal(encryptedPrivateKey.includes(privateKey), false);
  assert.equal(
    decryptDkimPrivateKey({
      context: { domainId, keyId },
      encryptedPrivateKey,
      encryptionKey,
    }),
    privateKey,
  );
  assert.throws(
    () =>
      decryptDkimPrivateKey({
        context: {
          domainId: "33333333-3333-4333-8333-333333333333",
          keyId,
        },
        encryptedPrivateKey,
        encryptionKey,
      }),
    (error) =>
      error instanceof DkimError && error.code === "PRIVATE_KEY_UNAVAILABLE",
  );
  assert.throws(
    () =>
      decryptDkimPrivateKey({
        context: { domainId, keyId },
        encryptedPrivateKey: `${encryptedPrivateKey}.`,
        encryptionKey,
      }),
    (error) =>
      error instanceof DkimError && error.code === "PRIVATE_KEY_UNAVAILABLE",
  );
});

test("PaperBoy selectors are UTC-derived and do not collide with Cloudflare", () => {
  const selector = createDkimSelector(fixedNow, "A1-B2-C3-D4");

  assert.equal(selector, "pb20260823a1b2c3d4");
  assert.equal(selector.startsWith("cf-bounce"), false);
  assert.equal(selector.startsWith("cf2024-1"), false);
  assert.equal(
    dkimDnsName("example.com", selector),
    "pb20260823a1b2c3d4._domainkey.example.com",
  );
});

test("a raw message verifies against its generated public key", async () => {
  const encryptionKey = randomBytes(32);
  const prepared = await prepareEncryptedDkimKey({
    domainId,
    encryptionKey,
    keyId,
    now: fixedNow,
    selector: "pb20260823known001",
  });
  const privateKey = decryptDkimPrivateKey({
    context: { domainId, keyId },
    encryptedPrivateKey: prepared.encryptedPrivateKey,
    encryptionKey,
  });
  const raw = [
    "From: PaperBoy <news@example.com>",
    "To: reader@example.net",
    "Subject: Signed edition",
    "Date: Sun, 23 Aug 2026 11:02:03 +1000",
    "Message-ID: <known-001@example.com>",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "The body is covered by the DKIM body hash.",
    "",
  ].join("\r\n");
  const signed = await signRawEmail({
    domain: "example.com",
    now: fixedNow,
    privateKey,
    rawMessage: raw,
    selector: prepared.selector,
  });
  const signedText = signed.toString("utf8");
  const signedHeaders = signedText.match(/\bh=([^;]+);/i)?.[1].toLowerCase();

  assert.match(signedText, /^DKIM-Signature:/);
  assert.deepEqual(
    signedHeaders
      ?.split(":")
      .map((header) => header.trim())
      .sort(),
    ["date", "from", "subject"],
  );
  assert.match(signedText, /\bbh=/);
  assert.equal(JSON.stringify(prepared).includes("PRIVATE KEY"), false);

  const verification = await dkimVerify(signed, {
    curTime: fixedNow,
    resolver: async (hostname, type) => {
      assert.equal(type, "TXT");
      assert.equal(
        hostname,
        "pb20260823known001._domainkey.example.com",
      );
      return [[dkimDnsValue(prepared.publicKey)]];
    },
  });

  assert.equal(verification.results[0].status.result, "pass");
  assert.equal(verification.results[0].signingDomain, "example.com");
});

test("Cloudflare-managed sending receives unsigned raw MIME", () => {
  const raw = [
    "From: PaperBoy <news@example.com>",
    "To: reader@example.net",
    "Subject: Cloudflare edition",
    "",
    "Cloudflare adds its platform-controlled DKIM signature.",
  ].join("\r\n");

  assert.deepEqual(
    prepareCloudflareManagedMessage(raw),
    Buffer.from(raw, "utf8"),
  );
  assert.throws(
    () =>
      prepareCloudflareManagedMessage(
        `DKIM-Signature: v=1; d=example.com; s=paperboy\r\n${raw}`,
      ),
    (error) =>
      error instanceof DkimError && error.code === "RAW_MESSAGE_INVALID",
  );
  assert.throws(
    () =>
      prepareCloudflareManagedMessage(
        `Date: Sun, 23 Aug 2026 11:02:03 +1000\r\n${raw}`,
      ),
    (error) =>
      error instanceof DkimError && error.code === "RAW_MESSAGE_INVALID",
  );
});

test("PaperBoy signing rejects raw messages without every signed header", async () => {
  await assert.rejects(
    () =>
      signRawEmail({
        domain: "example.com",
        privateKey: "not reached",
        rawMessage: "From: news@example.com\r\nSubject: Missing date\r\n\r\nBody",
        selector: "pb20260823test",
      }),
    (error) =>
      error instanceof DkimError && error.code === "RAW_MESSAGE_INVALID",
  );
});
