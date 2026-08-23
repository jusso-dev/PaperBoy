import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SUPPRESSION_CSV_BYTES,
  MAX_SUPPRESSION_IMPORT_ROWS,
  SuppressionError,
  parseCreateSuppressionInput,
  parseSuppressionCsv,
  parseSuppressionListInput,
  parseUpdateSuppressionInput,
} from "../src/lib/suppression-core.ts";

test("suppression CRUD input normalizes one plain address and bounded filters", () => {
  assert.deepEqual(
    parseCreateSuppressionInput({ email: " Reader@Example.NET " }),
    { email: "reader@example.net", reason: "manual" },
  );
  assert.deepEqual(
    parseCreateSuppressionInput({
      email: "opted-out@example.net",
      reason: "unsubscribed",
    }),
    { email: "opted-out@example.net", reason: "unsubscribed" },
  );
  assert.deepEqual(
    parseUpdateSuppressionInput({
      email: "new@example.net",
      reason: "complained",
    }),
    { email: "new@example.net", reason: "complained" },
  );
  assert.deepEqual(
    parseSuppressionListInput({
      limit: "25",
      query: " Example.NET ",
      reason: "bounced",
    }),
    { limit: 25, query: "example.net", reason: "bounced" },
  );
});

test("suppression CRUD rejects display names, unknown fields, and empty updates", () => {
  const invalid = [
    () =>
      parseCreateSuppressionInput({
        email: "Reader <reader@example.net>",
      }),
    () =>
      parseCreateSuppressionInput({
        email: "reader@example.net",
        org_id: "not-accepted",
      }),
    () => parseUpdateSuppressionInput({}),
    () => parseUpdateSuppressionInput({ reason: "temporary" }),
    () => parseSuppressionListInput({ query: 42 }),
    () => parseSuppressionListInput({ limit: 501 }),
  ];

  for (const operation of invalid) {
    assert.throws(
      operation,
      (error) =>
        error instanceof SuppressionError && error.code === "VALIDATION_ERROR",
    );
  }
});

test("CSV import supports BOM, CRLF, quotes, defaults, and strongest deduplication", () => {
  const parsed = parseSuppressionCsv(
    '\uFEFF"email","reason"\r\nReader@Example.NET,manual\r\nreader@example.net,bounced\r\n"complaint@example.net","complained"\r\nblank-reason@example.net,\r\n',
  );

  assert.equal(parsed.inputRows, 4);
  assert.deepEqual(parsed.rows, [
    { email: "reader@example.net", reason: "bounced" },
    { email: "complaint@example.net", reason: "complained" },
    { email: "blank-reason@example.net", reason: "manual" },
  ]);
});

test("CSV import rejects malformed or partially invalid files atomically", () => {
  const invalid = [
    "address\nreader@example.net\n",
    "email,reason,org\nreader@example.net,manual,elsewhere\n",
    'email,reason\n"reader@example.net,manual\n',
    "email,reason\ngood@example.net,manual\nbad address,manual\n",
    "email,reason\nreader@example.net,temporary\n",
    "email\n",
  ];

  for (const csv of invalid) {
    assert.throws(
      () => parseSuppressionCsv(csv),
      (error) =>
        error instanceof SuppressionError && error.code === "VALIDATION_ERROR",
    );
  }
});

test("CSV byte and row limits fail before import", () => {
  assert.throws(
    () => parseSuppressionCsv(`email\n${"x".repeat(MAX_SUPPRESSION_CSV_BYTES)}`),
    (error) =>
      error instanceof SuppressionError && error.code === "CSV_TOO_LARGE",
  );
  const rows = Array.from(
    { length: MAX_SUPPRESSION_IMPORT_ROWS + 1 },
    (_, index) => `reader-${index}@example.net`,
  );
  assert.throws(
    () => parseSuppressionCsv(`email\n${rows.join("\n")}`),
    (error) =>
      error instanceof SuppressionError && error.code === "CSV_TOO_MANY_ROWS",
  );
});
