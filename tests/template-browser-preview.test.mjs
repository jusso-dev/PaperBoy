import assert from "node:assert/strict";
import test from "node:test";
import { templateBrowserPreviewDocument } from "../src/lib/template-browser-preview.ts";

test("browser preview loads authored images without allowing scripts", () => {
  const document = templateBrowserPreviewDocument(
    '<img src="https://images.example.test/postcard.png"><script>alert(1)</script>',
  );

  assert.match(document, /img-src data: blob: https: http:/);
  assert.match(document, /font-src data: https: http:/);
  assert.match(document, /style-src 'unsafe-inline' https: http:/);
  assert.match(document, /default-src 'none'/);
  assert.doesNotMatch(document, /script-src/);
  assert.match(document, /referrer" content="no-referrer/);
});

test("browser preview keeps a complete HTML document out of a nested body", () => {
  const authored = `<!DOCTYPE html>
<html>
  <head><title>Certs that lapse</title><style>h1{color:navy}</style></head>
  <body><h1>Platform / Training</h1></body>
</html>`;
  const document = templateBrowserPreviewDocument(authored);

  assert.match(document, /<!DOCTYPE html>/);
  assert.match(document, /<h1>Platform \/ Training<\/h1>/);
  assert.match(document, /Content-Security-Policy/);
  assert.doesNotMatch(document, /<body>\s*<!DOCTYPE html>/i);
});
