# Performance changes — 5 September 2026

The dashboard fetched and sorted every matching event, constructed a date formatter twice per event, and fetched repeated event types for recent messages. It now groups events by local calendar day and type in PostgreSQL and returns distinct recent event types. Counts, period comparisons, daily/monthly charts, permissions, and status precedence remain unchanged. There is no persistent cache or stale-data interval.

The broadcast list issued one progress query per broadcast. It now loads progress in one grouped query for the already authorized broadcast IDs. Empty broadcasts retain zero counts. Existing single-broadcast callers use the same aggregation.

The broadcast workspace memoizes preview generation and source-line splitting by HTML content, avoiding repeated processing when dragging/resizing windows or editing unrelated envelope fields. This does not defer HTML edits or change submitted content.

## Measurements

Compared original functions from commit `788f0bd` with changed functions in the same Bun process, using identical fixtures in a disposable PostgreSQL 17 container on Docker context `m3-max`, reached over an SSH tunnel. Each measurement used one warm-up followed by three timed runs; numbers below are medians. Entire returned objects were compared with `assert.deepEqual`.

| Server function | Fixture | Before | After |
| --- | --- | ---: | ---: |
| `getPaperBoyDashboard` | 100,011 events, all time, Australia/Sydney | 4,917.9 ms | 83.9 ms |
| `listBroadcasts` | 200 broadcasts, six recipient statuses each except one empty broadcast | 33.1 ms | 23.1 ms |

The dashboard fixture deliberately concentrates 100,000 delivery events on one message/day, with additional dates, event types, and boundary timestamps. It demonstrates the cost of transferring/formatting repeated events, not a production traffic distribution. Both implementations ran against the same fixture. Broadcast query count fell from 202 to 3, including authorization. The checked-in regression test verifies three queries for 40 broadcasts.

These are synthetic server-function measurements, not production response times or browser interaction measurements. PostgreSQL still scans matching events; aggregation reduces transfer, sorting, and application CPU. All-time aggregation grows with active calendar days. Broadcast listing still returns all broadcasts and their existing template fields; pagination is a separate follow-up if large list payloads remain slow.

## Validation

- Production Next.js build, TypeScript, and ESLint passed with disposable database and development-only auth settings.
- New PostgreSQL regression covers all dashboard ranges, daily/monthly bucket contents, Sydney DST boundaries, New York, a quarter-hour timezone, UTC, empty tenants, permission rejection, status precedence, broadcast progress, and constant query count.
- Full suite with isolated PostgreSQL and test SMTP configuration: 313 passed, 2 skipped, 1 failed. Redis and Mailpit integration tests were skipped because those services were not configured.
- Remaining failure: `tests/suppression-postgres.test.mjs:220`, expected 2, actual 3. The same assertion failed in a temporary baseline copy with these performance changes reverted and existing user edits preserved. It is outside this change.
- Existing audience, organization, authorization, suppression, schema, and MCP edits were preserved. No migration or dependency change was needed. No production deployment was performed.

Run the focused regression against a disposable, migrated database:

```sh
PAPERBOY_TEST_DATABASE_URL=postgres://... bun test tests/performance-postgres.test.mjs
```

Aggregation and distinct selection follow the [official Drizzle select documentation](https://orm.drizzle.team/docs/select). Context7 was unavailable due to its monthly quota.
