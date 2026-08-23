import assert from "node:assert/strict";
import test from "node:test";
import {
  formatApiKeyDisplay,
  generateApiKey,
  hashApiKey,
  parseApiKey,
  verifyApiKeyHash,
} from "../src/lib/api-key-crypto.ts";

test("live and test keys have the promised prefixes and parse cleanly", () => {
  for (const environment of ["live", "test"]) {
    const key = generateApiKey(environment);
    assert.match(key.rawKey, new RegExp(`^pb_${environment}_`));
    assert.deepEqual(parseApiKey(key.rawKey), {
      environment,
      keyId: key.keyId,
    });
  }
});

test("only a SHA-256 hash is needed for verification", () => {
  const key = generateApiKey("live");
  assert.equal(key.keyHash, hashApiKey(key.rawKey));
  assert.equal(key.keyHash.length, 64);
  assert.equal(key.keyHash.includes(key.rawKey), false);
  assert.equal(verifyApiKeyHash(key.rawKey, key.keyHash), true);
  assert.equal(verifyApiKeyHash(`${key.rawKey}x`, key.keyHash), false);
});

test("display values never contain the secret", () => {
  const key = generateApiKey("test");
  const display = formatApiKeyDisplay("test", key.keyId);
  assert.equal(display, key.display);
  assert.equal(display.includes(key.rawKey), false);
  assert.match(display, /^pb_test_/);
});

test("generated keys and public identifiers are unique", () => {
  const generated = Array.from({ length: 100 }, () => generateApiKey("live"));
  assert.equal(new Set(generated.map((key) => key.rawKey)).size, 100);
  assert.equal(new Set(generated.map((key) => key.keyId)).size, 100);
});

test("malformed bearer values are rejected", () => {
  assert.equal(parseApiKey(null), null);
  assert.equal(parseApiKey("pb_live_short"), null);
  assert.equal(parseApiKey(" pb_live_invalid "), null);
  assert.equal(parseApiKey("pb_prod_invalid"), null);
  assert.equal(verifyApiKeyHash("anything", "not-a-sha256-hash"), false);
});
