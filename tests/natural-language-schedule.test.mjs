import assert from "node:assert/strict";
import test from "node:test";
import {
  formatNaturalLanguageSchedule,
  parseNaturalLanguageSchedule,
} from "../src/lib/natural-language-schedule.ts";

const reference = new Date("2026-08-25T02:00:00.000Z");
const timeZone = "Australia/Sydney";

test("natural schedule parses future local dates in Australia/Sydney", () => {
  const parsed = parseNaturalLanguageSchedule(
    "Thursday 3rd September 10 am",
    reference,
    timeZone,
  );

  assert.equal(parsed.error, null);
  assert.equal(parsed.date?.toISOString(), "2026-09-03T00:00:00.000Z");
  assert.match(parsed.label ?? "", /Thursday 3 September 2026 at 10:00 am AEST/);
});

test("natural schedule exposes conflicting weekday and calendar date", () => {
  const parsed = parseNaturalLanguageSchedule(
    "Wednesday 3rd September 10 am",
    reference,
    timeZone,
  );

  assert.equal(parsed.date, null);
  assert.match(parsed.error ?? "", /3 September 2026 is Thursday, not Wednesday/);
});

test("natural schedule requires one future day and time", () => {
  assert.match(
    parseNaturalLanguageSchedule("September", reference, timeZone).error ?? "",
    /day and time/,
  );
  assert.match(
    parseNaturalLanguageSchedule("yesterday at 10 am", reference, timeZone).error ?? "",
    /future/,
  );
});

test("natural schedule formatter includes fixed timezone abbreviation", () => {
  assert.match(
    formatNaturalLanguageSchedule("2026-12-03T23:00:00.000Z", timeZone),
    /Friday 4 December 2026 at 10:00 am AEDT/,
  );
});
