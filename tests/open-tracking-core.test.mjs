import assert from "node:assert/strict";
import test from "node:test";
import {
  appendOpenTrackingPixel,
  createOpenTrackingSignature,
  createOpenTrackingUrl,
  OpenTrackingConfigurationError,
  OpenTrackingSettingsError,
  openTrackingPublicUrl,
  parseOpenTrackingSigningKey,
  parseUpdateOpenTrackingInput,
  verifyOpenTrackingSignature,
} from "../src/lib/open-tracking-core.ts";

const key = Buffer.alloc(32, 7);
const messageId = "11111111-1111-4111-8111-111111111111";
const otherMessageId = "22222222-2222-4222-8222-222222222222";

test("open-tracking setting input is strict", () => {
  assert.deepEqual(parseUpdateOpenTrackingInput({ enabled: true }), {
    enabled: true,
  });
  for (const value of [{}, { enabled: "true" }, { enabled: false, orgId: "x" }]) {
    assert.throws(
      () => parseUpdateOpenTrackingInput(value),
      OpenTrackingSettingsError,
    );
  }
});

test("open-tracking signing requires a dedicated canonical 32-byte key", () => {
  assert.deepEqual(parseOpenTrackingSigningKey(key.toString("base64")), key);
  for (const value of [undefined, "", Buffer.alloc(31).toString("base64"), "not base64"] ) {
    assert.throws(
      () => parseOpenTrackingSigningKey(value),
      OpenTrackingConfigurationError,
    );
  }
});

test("open-tracking public URLs require HTTPS outside local development", () => {
  assert.equal(
    openTrackingPublicUrl("https://paperboy.example/app").origin,
    "https://paperboy.example",
  );
  assert.throws(
    () => openTrackingPublicUrl("http://paperboy.example"),
    OpenTrackingConfigurationError,
  );
  assert.throws(
    () => openTrackingPublicUrl("https://paperboy.example/#fragment"),
    OpenTrackingConfigurationError,
  );
});

test("open-tracking signatures are bound to one message", () => {
  const signature = createOpenTrackingSignature({ key, messageId });
  assert.equal(
    verifyOpenTrackingSignature({ key, messageId, signature }),
    true,
  );
  assert.equal(
    verifyOpenTrackingSignature({ key, messageId: otherMessageId, signature }),
    false,
  );
  assert.equal(
    verifyOpenTrackingSignature({
      key,
      messageId,
      signature: `${signature.slice(0, -1)}A`,
    }),
    false,
  );
});

test("open-tracking URL is first-party and the pixel is inserted before body close", () => {
  const url = createOpenTrackingUrl({
    baseUrl: "https://mail.example.com/app",
    key,
    messageId,
  });
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://mail.example.com");
  assert.match(parsed.pathname, new RegExp(`^/o/${messageId}/[A-Za-z0-9_-]+\\.gif$`));

  const html = appendOpenTrackingPixel({
    html: "<html><body><p>Edition</p></body></html>",
    url,
  });
  assert.match(html, /<p>Edition<\/p><img /);
  assert.ok(html.indexOf("<img ") < html.indexOf("</body>"));
  assert.match(html, /aria-hidden="true"/);
});
