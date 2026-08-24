import assert from "node:assert/strict";
import test from "node:test";
import { publicSignUpEnabled } from "../src/lib/signup-policy.ts";

test("public signup is disabled unless explicitly enabled", () => {
  assert.equal(publicSignUpEnabled({}), false);
  assert.equal(publicSignUpEnabled({ PAPERBOY_PUBLIC_SIGNUP_ENABLED: "" }), false);
  assert.equal(
    publicSignUpEnabled({ PAPERBOY_PUBLIC_SIGNUP_ENABLED: "false" }),
    false,
  );
  assert.equal(
    publicSignUpEnabled({ PAPERBOY_PUBLIC_SIGNUP_ENABLED: "true" }),
    true,
  );
});

test("public signup rejects ambiguous configuration", () => {
  assert.throws(
    () =>
      publicSignUpEnabled({ PAPERBOY_PUBLIC_SIGNUP_ENABLED: "TRUE" }),
    /must be either true or false/,
  );
});
