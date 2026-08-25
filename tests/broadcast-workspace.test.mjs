import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("broadcast workspace owns the viewport and uses PaperBoy postal styling", async () => {
  const [component, css] = await Promise.all([
    readFile(
      new URL(
        "../src/components/broadcasts/broadcast-preview-workspace.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(css, /body:has\(\.broadcast-workspace\)[\s\S]*overflow: hidden/);
  assert.match(css, /\.broadcast-workspace \{[\s\S]*height: 100dvh/);
  assert.match(css, /\.broadcast-workspace \{[\s\S]*width: 100dvw/);
  assert.match(css, /\/\* PaperBoy broadcast dispatch desk\. \*\//);
  assert.doesNotMatch(css, /\/\* Resend-style broadcast inspection workspace\. \*\//);
  assert.match(component, />PaperBoy<\/Link>/);
  assert.match(component, /HTML output/);
  assert.match(component, /broadcast-html-editor/);
  assert.match(component, /sendBroadcastTestEmailAction/);
  assert.match(component, /WorkspaceWindow/);
  assert.match(component, /Signed unsubscribe link included/);
  assert.doesNotMatch(component, /href="\/app\/send"/);
  assert.doesNotMatch(component, /Frozen HTML/);
  assert.doesNotMatch(component, /Reply-To/);
  assert.match(css, /\.broadcast-window \{/);
  assert.match(css, /cursor: nwse-resize/);
  assert.match(css, /\.broadcast-html-editor \{/);
});
