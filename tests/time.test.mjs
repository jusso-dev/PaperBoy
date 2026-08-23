import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalTimeZone,
  formatDateTime,
  protocolTimestamp,
  startOfCalendarDate,
  startOfNextCalendarDate,
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

test("calendar date filters use the user's IANA timezone across DST", () => {
  assert.equal(
    startOfCalendarDate("2026-08-24", "Australia/Sydney")?.toISOString(),
    "2026-08-23T14:00:00.000Z",
  );
  assert.equal(
    startOfCalendarDate("2026-10-04", "Australia/Sydney")?.toISOString(),
    "2026-10-03T14:00:00.000Z",
  );
  assert.equal(
    startOfNextCalendarDate("2026-10-04", "Australia/Sydney")?.toISOString(),
    "2026-10-04T13:00:00.000Z",
  );
  assert.equal(startOfCalendarDate("2026-02-30", "Australia/Sydney"), null);
  assert.equal(startOfCalendarDate("2026-08-24", "Not/A_Zone"), null);
});
