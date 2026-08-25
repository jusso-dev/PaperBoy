import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy broadcast migration deletes only cancelled chunk records", async () => {
  const sql = await readFile(
    new URL(
      "../drizzle/0025_remove_legacy_chunked_broadcasts.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.equal(
    sql,
    `DELETE FROM "broadcasts"
WHERE "status" = 'cancelled'
  AND "name" ~ ' — part [1-9][0-9]* of [1-9][0-9]*$';
`,
  );

  const pattern = /"name" ~ '([^']+)'/.exec(sql)?.[1];
  assert.ok(pattern);
  const legacySuffix = new RegExp(pattern);
  const rows = [
    { id: "cancelled-one", name: "Cattle prices — part 1 of 10", status: "cancelled" },
    { id: "cancelled-nine", name: "Cattle prices — part 9 of 10", status: "cancelled" },
    { id: "canonical", name: "Cattle prices", status: "cancelled" },
    { id: "scheduled", name: "Cattle prices — part 1 of 10", status: "scheduled" },
    { id: "running", name: "Cattle prices — part 1 of 10", status: "running" },
    { id: "paused", name: "Cattle prices — part 1 of 10", status: "paused" },
    { id: "completed", name: "Cattle prices — part 1 of 10", status: "completed" },
  ];

  assert.deepEqual(
    rows
      .filter(
        (row) => row.status === "cancelled" && legacySuffix.test(row.name),
      )
      .map((row) => row.id),
    ["cancelled-one", "cancelled-nine"],
  );
});
