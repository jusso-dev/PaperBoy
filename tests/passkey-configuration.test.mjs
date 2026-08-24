import assert from "node:assert/strict";
import test from "node:test";
import { configuredPasskeys } from "../src/lib/passkey-configuration.ts";

test("passkeys bind WebAuthn to one explicit HTTPS origin and RP ID", () => {
  assert.deepEqual(
    configuredPasskeys({
      PAPERBOY_PASSKEY_ORIGIN: "https://mail.internal.example.com",
      PAPERBOY_PASSKEY_RP_ID: "internal.example.com",
    }),
    {
      origin: "https://mail.internal.example.com",
      rpID: "internal.example.com",
      rpName: "PaperBoy",
    },
  );
});

test("passkeys reject insecure public origins and unrelated RP IDs", () => {
  assert.throws(
    () => configuredPasskeys({ BETTER_AUTH_URL: "http://paperboy.example.com" }),
    /HTTPS origin/,
  );
  assert.throws(
    () =>
      configuredPasskeys({
        PAPERBOY_PASSKEY_ORIGIN: "https://paperboy.example.com",
        PAPERBOY_PASSKEY_RP_ID: "attacker.example.net",
      }),
    /must equal the passkey origin host/,
  );
  assert.equal(
    configuredPasskeys({ BETTER_AUTH_URL: "http://127.0.0.1:3000" }).rpID,
    "127.0.0.1",
  );
});
