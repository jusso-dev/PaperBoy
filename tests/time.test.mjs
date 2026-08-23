import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalTimeZone,
  formatDateTime,
  protocolTimestamp,
} from "../src/lib/time.ts";

test("IANA timezones are canonicalized and invalid input is rejected", () => {
  assert.equal(canonicalTimeZone("Australia/Sydney"), "Australia/Sydney");
  assert.equal(canonicalTimeZone("../../etc/passwd"), null);
});

test("display uses the user timezone while protocol output stays UTC", () => {
  assert.match(
    formatDateTime("2026-01-01T00:00:00Z", "Australia/Sydney"),
    /11:00/,
  );
  assert.equal(
    protocolTimestamp("2026-01-01T11:00:00+11:00"),
    "2026-01-01T00:00:00.000Z",
  );
});
