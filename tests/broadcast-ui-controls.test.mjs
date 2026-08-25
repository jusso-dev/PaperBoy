import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("broadcast UI exposes editing, cancellation, and status filtering", async () => {
  const [indexPage, preview, previewPage] = await Promise.all([
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
  ]);

  assert.match(indexPage, /Filter by status/);
  assert.match(indexPage, /BROADCAST_STATUSES\.map/);
  assert.match(preview, /action=\{updateBroadcastAction\}/);
  assert.match(preview, /action=\{cancelBroadcastAction\}/);
  assert.match(preview, /NaturalLanguageScheduleField/);
  assert.match(previewPage, /broadcast\.status === "scheduled"/);
});
