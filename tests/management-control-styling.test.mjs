import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("table management controls stay compact and confirmation labels stay aligned", async () => {
  const [audiences, suppressions, css] = await Promise.all([
    readFile(new URL("../src/app/app/audiences/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/app/suppressions/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(audiences, /className="table-manage-actions"/);
  assert.match(audiences, /className="confirmation-control"/);
  assert.match(suppressions, /className="table-manage-actions"/);
  assert.match(suppressions, /className="confirmation-control"/);
  assert.match(css, /\.table-manage-actions \{[\s\S]*display: flex/);
  assert.match(css, /\.confirmation-control \{[\s\S]*align-items: center/);
  assert.match(css, /input\[type='checkbox'\] \{[\s\S]*height: 16px/);
});
