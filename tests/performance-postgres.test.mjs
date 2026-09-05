import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { mock } from "bun:test";

const databaseUrl = process.env.PAPERBOY_TEST_DATABASE_URL;

test("dashboard aggregation preserves timezone totals; broadcast list uses constant queries", {
  skip: databaseUrl ? false : "PAPERBOY_TEST_DATABASE_URL is not configured",
}, async () => {
  process.env.DATABASE_URL = databaseUrl;
  mock.module("server-only", () => ({}));
  const { db } = await import("../src/db/index.ts");
  const { eq, inArray } = await import("drizzle-orm");
  const { orgs, users, orgMembers, domains, messages, events, broadcasts, broadcastRecipients } = await import("../src/db/schema.ts");
  const { getPaperBoyDashboard } = await import("../src/lib/dashboard.ts");
  const { listBroadcasts } = await import("../src/lib/broadcasts.ts");
  const { localDateKey, dashboardWindow } = await import("../src/lib/dashboard-range.ts");
  const orgId = randomUUID();
  const otherOrgId = randomUUID();
  const actorUserId = randomUUID();
  const domainId = randomUUID();
  const messageId = randomUUID();
  const now = new Date("2026-10-05T12:00:00Z");
  const eventRows = [
    ["2026-01-01T00:00:00Z", "delivered"],
    ["2026-09-21T14:00:00Z", "delivered"],
    ["2026-09-28T13:59:59.999Z", "delivered"],
    ["2026-09-28T14:00:00Z", "delivered"],
    ["2026-10-03T15:59:59.999Z", "bounced"],
    ["2026-10-03T16:00:00Z", "complained"],
    ["2026-10-04T12:59:59.999Z", "opened"],
    ["2026-10-04T13:00:00Z", "delivered"],
    ["2026-10-05T13:00:00Z", "delivered"],
    ["2026-10-07T00:00:00Z", "delivered"],
    ["2026-10-04T00:00:00Z", "queued"],
    ...Array.from({ length: 500 }, () => ["2026-10-04T00:00:00Z", "delivered"]),
  ].map(([createdAt, type]) => ({ createdAt: new Date(createdAt), type, messageId }));
  const originalLogger = db.session.logger;

  try {
    await db.insert(orgs).values([{ id: orgId, name: "Performance test" }, { id: otherOrgId, name: "Other tenant" }]);
    await db.insert(users).values({ id: actorUserId, email: `${actorUserId}@example.com`, name: "Owner" });
    await db.insert(orgMembers).values({ orgId, userId: actorUserId, role: "owner" });
    await db.insert(domains).values({ id: domainId, orgId, name: `${domainId}.example.com` });
    await db.insert(messages).values({ id: messageId, orgId, domainId, from: "sender@example.com", to: ["reader@example.com"], subject: "Performance", textBody: "Hello", createdAt: now });
    await db.insert(events).values(eventRows);

    for (const timeZone of ["Australia/Sydney", "America/New_York", "Asia/Katmandu", "UTC"]) {
      for (const range of [7, 14, 30, "all"]) {
        const dashboard = await getPaperBoyDashboard({ actorUserId, orgId, now, range, timeZone });
        const window = dashboardWindow({ range, today: localDateKey(now, timeZone) });
        for (const type of ["delivered", "opened", "bounced", "complained"]) {
          const matching = eventRows.filter((event) => event.type === type).map((event) => localDateKey(event.createdAt, timeZone));
          const current = matching.filter((date) => (!window.currentStartKey || date >= window.currentStartKey) && date < window.endKey).length;
          const previous = matching.filter((date) => window.previousStartKey && date >= window.previousStartKey && date < window.currentStartKey).length;
          const metric = dashboard.metrics.find((metric) => metric.id === type);
          assert.equal(metric.value, current, `${timeZone}/${range}/${type}`);
          assert.equal(metric.delta, range === "all" ? null : previous === 0 ? current === 0 ? 0 : null : Number(((current - previous) / previous * 100).toFixed(1)), `${timeZone}/${range}/${type}: ${current}/${previous}`);
          assert.equal(dashboard.series.reduce((total, point) => total + point[type], 0), current);
          for (const point of dashboard.series) {
            const expected = matching.filter((date) =>
              (!window.currentStartKey || date >= window.currentStartKey) &&
              date < window.endKey &&
              (dashboard.bucket === "month" ? date.slice(0, 7) : date) === point.bucket
            ).length;
            assert.equal(point[type], expected, `${timeZone}/${range}/${type}/${point.bucket}`);
          }
        }
        assert.equal(dashboard.recentEmails[0].status, "complained");
      }
    }
    await assert.rejects(getPaperBoyDashboard({ actorUserId, orgId: otherOrgId, now, range: 7, timeZone: "UTC" }));
    await db.insert(orgMembers).values({ orgId: otherOrgId, userId: actorUserId, role: "owner" });
    const empty = await getPaperBoyDashboard({ actorUserId, orgId: otherOrgId, now, range: "all", timeZone: "UTC" });
    assert.equal(empty.metrics[0].value, 0);
    assert.deepEqual(empty.recentEmails, []);

    const broadcastRows = Array.from({ length: 40 }, (_, index) => ({ id: randomUUID(), orgId, name: `Broadcast ${index}`, from: "sender@example.com", templateName: "Test", templateSubject: "Test", templateText: "Hello", environment: "test" }));
    await db.insert(broadcasts).values(broadcastRows);
    const statuses = ["pending", "processing", "queued", "suppressed", "failed", "cancelled"];
    await db.insert(broadcastRecipients).values(broadcastRows.slice(1).flatMap((broadcast) => statuses.map((status, position) => ({ broadcastId: broadcast.id, status, position, email: `reader-${position}@example.com` }))));
    const queries = [];
    db.session.logger = { logQuery(query) { queries.push(query); } };
    const listed = await listBroadcasts({ actorUserId, orgId });
    db.session.logger = originalLogger;
    assert.equal(queries.length, 3, "permission, broadcasts, grouped progress: independent of broadcast count");
    assert.equal(listed.length, 40);
    assert.equal(listed.find((row) => row.id === broadcastRows[0].id).progress.total, 0);
    for (const row of listed.filter((row) => row.id !== broadcastRows[0].id)) {
      assert.equal(row.progress.total, 6);
      for (const status of statuses) assert.equal(row.progress[status], 1);
    }
    assert.deepEqual(await listBroadcasts({ actorUserId, orgId: otherOrgId }), []);
  } finally {
    db.session.logger = originalLogger;
    await db.delete(orgs).where(inArray(orgs.id, [orgId, otherOrgId]));
    await db.delete(users).where(eq(users.id, actorUserId));
  }
});
