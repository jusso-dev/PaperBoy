import assert from "node:assert/strict";
import test from "node:test";
import {
  dashboardRangeLabel,
  dashboardSeriesPlan,
  dashboardWindow,
  parseDashboardRange,
} from "../src/lib/dashboard-range.ts";

test("dashboard range accepts presets and all time", () => {
  assert.equal(parseDashboardRange(undefined), 7);
  assert.equal(parseDashboardRange("7"), 7);
  assert.equal(parseDashboardRange("14"), 14);
  assert.equal(parseDashboardRange("30"), 30);
  assert.equal(parseDashboardRange("all"), "all");
  assert.equal(parseDashboardRange("90"), 7);
  assert.equal(parseDashboardRange("forever"), 7);
});

test("all-time label does not invent a calendar window", () => {
  assert.equal(
    dashboardRangeLabel({
      now: new Date("2026-08-25T00:00:00.000Z"),
      range: "all",
      timeZone: "Australia/Sydney",
    }),
    "All time",
  );
});

test("preset windows keep a previous period for deltas", () => {
  assert.deepEqual(dashboardWindow({ range: 7, today: "2026-08-25" }), {
    currentStartKey: "2026-08-19",
    endKey: "2026-08-26",
    previousStartKey: "2026-08-12",
  });
});

test("all-time windows have no start bound", () => {
  assert.deepEqual(dashboardWindow({ range: "all", today: "2026-08-25" }), {
    currentStartKey: null,
    endKey: "2026-08-26",
    previousStartKey: null,
  });
});

test("all-time activity stays daily until the span is long", () => {
  assert.deepEqual(
    dashboardSeriesPlan({
      firstDateKey: "2026-08-01",
      range: "all",
      today: "2026-08-25",
    }),
    {
      bucket: "day",
      keys: [
        "2026-08-01",
        "2026-08-02",
        "2026-08-03",
        "2026-08-04",
        "2026-08-05",
        "2026-08-06",
        "2026-08-07",
        "2026-08-08",
        "2026-08-09",
        "2026-08-10",
        "2026-08-11",
        "2026-08-12",
        "2026-08-13",
        "2026-08-14",
        "2026-08-15",
        "2026-08-16",
        "2026-08-17",
        "2026-08-18",
        "2026-08-19",
        "2026-08-20",
        "2026-08-21",
        "2026-08-22",
        "2026-08-23",
        "2026-08-24",
        "2026-08-25",
      ],
    },
  );
});

test("all-time activity rolls up to months after 90 days", () => {
  const plan = dashboardSeriesPlan({
    firstDateKey: "2025-01-15",
    range: "all",
    today: "2026-08-25",
  });
  assert.equal(plan.bucket, "month");
  assert.equal(plan.keys[0], "2025-01");
  assert.equal(plan.keys.at(-1), "2026-08");
  assert.equal(plan.keys.length, 20);
});
