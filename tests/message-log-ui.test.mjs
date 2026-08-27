import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parseMessageLogOrder,
  parseMessageLogPage,
  parseMessageLogQuery,
  parseMessageLogSort,
} from "../src/lib/message-status-core.ts";

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
  assert.match(page, /name="q"/);
  assert.match(page, /MESSAGE_LOG_PAGE_SIZE/);
  assert.match(page, /sortDirection: order/);
  assert.match(page, /sendQueuedMessagesAction/);
  assert.match(page, /jobsWorkerIsLive/);
  assert.match(page, /Send queued now/);
  assert.match(page, /BullMQ jobs worker/);
  assert.match(actions, /dispatchQueuedOrganizationMessages/);
  assert.match(table, /message-log-subject/);
  assert.match(table, /row\.subject\.trim\(\) \|\| "\(no subject\)"/);
  assert.match(table, /SandboxedHtmlPreview/);
  assert.match(table, /templateBrowserPreviewDocument\(result\.message\.html\)/);
  assert.match(table, /result\.message\.text/);
  assert.match(table, /This message has no stored body/);
  assert.match(table, /sortLinks\.subject/);
  assert.match(actions, /html: message\.html/);
  assert.match(actions, /text: message\.text/);
  assert.match(statuses, /subject: messages\.subject/);
  assert.match(statuses, /overviewFromRow/);
  assert.match(statuses, /ilike/);
  assert.match(statuses, /offset\(/);
  assert.doesNotMatch(
    statuses,
    /listRows[\s\S]*html: messages\.html/,
  );
  assert.doesNotMatch(page, /limited to the most recent 50/);
  assert.doesNotMatch(table, /Up to 50 matching messages/);
});

test("delivery log query params parse search, sort, and page", () => {
  assert.equal(parseMessageLogQuery("  ticket 118  "), "ticket 118");
  assert.equal(parseMessageLogQuery(""), undefined);
  assert.equal(parseMessageLogSort("subject"), "subject");
  assert.equal(parseMessageLogSort("nope"), "created");
  assert.equal(parseMessageLogOrder("asc"), "asc");
  assert.equal(parseMessageLogOrder("sideways"), "desc");
  assert.equal(parseMessageLogPage("3"), 3);
  assert.equal(parseMessageLogPage("0"), 1);
});
