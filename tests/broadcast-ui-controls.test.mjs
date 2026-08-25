import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("broadcast UI exposes editing, cancellation, and status filtering", async () => {
  const [indexPage, preview, previewPage, actions] = await Promise.all([
    readFile(new URL("../src/app/app/broadcasts/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL(
        "../src/components/broadcasts/broadcast-preview-workspace.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../src/app/app/broadcasts/[broadcastId]/preview/page.tsx",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../src/app/app/broadcasts/actions.ts", import.meta.url), "utf8"),
  ]);

  assert.match(indexPage, /Filter by status/);
  assert.match(indexPage, /BROADCAST_STATUSES\.map/);
  assert.match(preview, /action=\{updateBroadcastAction\}/);
  assert.match(preview, /action=\{cancelBroadcastAction\}/);
  assert.match(preview, /sendBroadcastTestEmailAction/);
  assert.match(preview, /name="html"/);
  assert.match(preview, /setHtmlValue/);
  assert.match(preview, /templateBrowserPreviewDocument\(htmlValue\)/);
  assert.match(preview, /key=\{previewDocument\}/);
  assert.match(preview, /srcDoc=\{previewDocument\}/);
  assert.match(preview, /NaturalLanguageScheduleField/);
  assert.match(previewPage, /key=\{broadcast\.id\}/);
  assert.match(previewPage, /broadcast\.status === "scheduled"/);
  assert.match(previewPage, /canSend=\{canSend\}/);
  assert.match(actions, /html: formData.get\("html"\)/);
  assert.match(actions, /queueBroadcastTestEmail/);
  assert.match(actions, /loadBroadcast: getBroadcast/);
  assert.match(actions, /queue: queueEmail/);
  assert.match(actions, /from: formData.get\("from"\)/);
});
