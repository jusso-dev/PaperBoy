import assert from "node:assert/strict";
import test from "node:test";
import {
  buildDashboardExportCsv,
  csvCell,
  dashboardExportFilename,
} from "../src/lib/dashboard-export.ts";

test("csv cells quote commas and doubled quotes", () => {
  assert.equal(csvCell("plain"), "plain");
  assert.equal(csvCell("hello, world"), '"hello, world"');
  assert.equal(csvCell('Say "hi"'), '"Say ""hi"""');
  assert.equal(csvCell(null), "");
});

test("overview export filename encodes the selected range", () => {
  const now = new Date("2026-08-25T12:00:00.000Z");
  assert.equal(
    dashboardExportFilename({ now, range: 7 }),
    "paperboy-overview-7d-20260825.csv",
  );
  assert.equal(
    dashboardExportFilename({ now, range: "all" }),
    "paperboy-overview-all-20260825.csv",
  );
});

test("overview export csv includes metrics, activity, and messages", () => {
  const csv = buildDashboardExportCsv({
    generatedAt: "2026-08-25T12:00:00.000Z",
    messages: [
      {
        createdAt: "2026-08-24T01:00:00.000Z",
        id: "11111111-1111-4111-8111-111111111111",
        recipient: "ada@example.com",
        status: "sent",
        subject: "Weekly report, with commas",
      },
    ],
    messagesTruncated: false,
    metrics: [
      { delta: 12.5, id: "delivered", label: "Delivered", value: 40 },
      { delta: null, id: "clicked", label: "Clicked", value: null },
    ],
    range: "all",
    rangeLabel: "All time",
    series: [
      {
        bounced: 1,
        bucket: "2026-08",
        clicked: 0,
        complained: 0,
        delivered: 40,
        opened: 8,
      },
    ],
    timeZone: "Australia/Sydney",
  });

  assert.match(csv, /^﻿# PaperBoy overview export/m);
  assert.match(csv, /# range,all/);
  assert.match(csv, /# range_label,All time/);
  assert.match(csv, /# messages_truncated,false/);
  assert.match(csv, /delivered,Delivered,40,12.5/);
  assert.match(csv, /clicked,Clicked,,/);
  assert.match(csv, /2026-08,40,8,0,1,0/);
  assert.match(csv, /"Weekly report, with commas"/);
});
