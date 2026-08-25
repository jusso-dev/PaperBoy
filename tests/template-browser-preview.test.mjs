import assert from "node:assert/strict";
import test from "node:test";
import { templateBrowserPreviewDocument } from "../src/lib/template-browser-preview.ts";

test("browser preview loads authored images without allowing scripts", () => {
  const document = templateBrowserPreviewDocument(
    '<img src="https://images.example.test/postcard.png"><script>alert(1)</script>',
  );

  assert.match(document, /img-src data: blob: https: http:/);
  assert.match(document, /default-src 'none'/);
  assert.doesNotMatch(document, /script-src/);
  assert.match(document, /referrer" content="no-referrer/);
});
