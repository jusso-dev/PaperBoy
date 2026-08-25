import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("emails log shows subject in the list and body in the drawer", async () => {
  const [page, table, actions, statuses] = await Promise.all([
    readFile(new URL("../src/app/app/logs/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../src/app/app/logs/message-log-table.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../src/app/app/logs/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/message-statuses.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /subject: message\.subject/);
  assert.match(page, /to: message\.to/);
  assert.match(table, /message-log-subject/);
  assert.match(table, /row\.subject\.trim\(\) \|\| "\(no subject\)"/);
  assert.match(table, /SandboxedHtmlPreview/);
  assert.match(table, /templateBrowserPreviewDocument\(result\.message\.html\)/);
  assert.match(table, /result\.message\.text/);
  assert.match(table, /This message has no stored body/);
  assert.match(actions, /html: message\.html/);
  assert.match(actions, /text: message\.text/);
  assert.match(statuses, /subject: messages\.subject/);
  assert.match(statuses, /overviewFromRow/);
  assert.doesNotMatch(
    statuses,
    /listRows[\s\S]*html: messages\.html/,
  );
});
