import "server-only";

import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { events, messages } from "@/db/schema";
import {
  DASHBOARD_EXPORT_MESSAGE_LIMIT,
  type DashboardExportMessage,
} from "@/lib/dashboard-export";
import {
  dashboardSeriesPlan,
  dashboardWindow,
  displayDate,
  displayMonth,
  localDateKey,
  rangeBoundary,
  type DashboardBucket,
  type DashboardRange,
} from "@/lib/dashboard-range";
import {
  resolveDashboardEmailStatus,
  type DashboardEmailStatus,
} from "@/lib/dashboard-status";
import { requireMessageRead } from "@/lib/message-statuses";
import { normalizeTimeZone } from "@/lib/time";

export type { DashboardEmailStatus } from "@/lib/dashboard-status";
export type { DashboardBucket, DashboardRange, DashboardRangeDays } from "@/lib/dashboard-range";
export {
  DASHBOARD_RANGE_ALL,
  DASHBOARD_RANGE_PRESETS,
  DASHBOARD_RANGES,
  dashboardRangeLabel,
  dashboardRangeParam,
  parseDashboardRange,
} from "@/lib/dashboard-range";

export type DashboardMetric = {
  comparison: "none" | "previous-period";
  delta: number | null;
  id: "delivered" | "opened" | "clicked" | "bounced" | "complained";
  label: string;
  note?: string;
  trend: number[];
  value: number | null;
};

export type DashboardActivityPoint = {
  clicked: number;
  date: string;
  delivered: number;
  opened: number;
};

export type DashboardSeriesPoint = {
  bounced: number;
  bucket: string;
  clicked: number;
  complained: number;
  delivered: number;
  opened: number;
};

export type DashboardEmail = {
  createdAt: string;
  id: string;
  recipient: string;
  status: DashboardEmailStatus;
  subject: string;
};

export type PaperBoyDashboard = {
  activity: DashboardActivityPoint[];
  bucket: DashboardBucket;
  metrics: DashboardMetric[];
  recentEmails: DashboardEmail[];
  series: DashboardSeriesPoint[];
};

export type PaperBoyDashboardExport = {
  dashboard: PaperBoyDashboard;
  messages: DashboardExportMessage[];
  messagesTruncated: boolean;
};

type DashboardEventType =
  | "bounced"
  | "complained"
  | "delivered"
  | "opened";

const EVENT_TYPES: DashboardEventType[] = [
  "delivered",
  "opened",
  "bounced",
  "complained",
];

function percentageDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function emptyBucketCounts() {
  return { bounced: 0, complained: 0, delivered: 0, opened: 0 };
}

export async function getPaperBoyDashboard(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  range: DashboardRange;
  timeZone: string;
}): Promise<PaperBoyDashboard> {
  const timeZone = normalizeTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const today = localDateKey(now, timeZone);
  const window = dashboardWindow({ range: input.range, today });
  const previousStart = window.previousStartKey
    ? rangeBoundary(window.previousStartKey, timeZone)
    : null;
  const end = rangeBoundary(window.endKey, timeZone);

  // Reuse the established permission boundary before dashboard-only queries.
  await requireMessageRead({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
  });

  // Aggregate before crossing the database boundary; work scales with days, not events.
  const eventDate = sql<string>`to_char(${events.createdAt} at time zone ${timeZone}, 'YYYY-MM-DD')`;
  const [eventRows, recentRows] = await Promise.all([
    db
      .select({
        dateKey: eventDate.as("date_key"),
        count: count(),
        type: events.type,
      })
      .from(events)
      .innerJoin(messages, eq(events.messageId, messages.id))
      .where(
        and(
          eq(messages.orgId, input.orgId),
          inArray(events.type, EVENT_TYPES),
          previousStart ? gte(events.createdAt, previousStart) : undefined,
          lt(events.createdAt, end),
        ),
      )
      .groupBy(sql`date_key`, events.type),
    db
      .select({
        createdAt: messages.createdAt,
        id: messages.id,
        recipient: messages.to,
        status: messages.status,
        subject: messages.subject,
      })
      .from(messages)
      .where(eq(messages.orgId, input.orgId))
      .orderBy(desc(messages.createdAt), desc(messages.id))
      .limit(5),
  ]);

  const firstDateKey = eventRows.reduce<string | null>((earliest, event) => {
    const key = event.dateKey;
    return earliest === null || key < earliest ? key : earliest;
  }, null);
  const plan = dashboardSeriesPlan({
    firstDateKey,
    range: input.range,
    today,
  });
  const currentCounts = emptyBucketCounts();
  const previousCounts = emptyBucketCounts();
  const bucketCounts = new Map(
    plan.keys.map((key) => [key, emptyBucketCounts()]),
  );

  for (const event of eventRows) {
    const type = event.type as DashboardEventType;
    const dateKey = event.dateKey;
    const bucketKey = plan.bucket === "month" ? dateKey.slice(0, 7) : dateKey;
    const inCurrent =
      window.currentStartKey === null || dateKey >= window.currentStartKey;

    if (inCurrent) {
      currentCounts[type] += event.count;
      const bucket = bucketCounts.get(bucketKey);
      if (bucket) bucket[type] += event.count;
    } else {
      previousCounts[type] += event.count;
    }
  }

  const comparison = input.range === "all" ? "none" : "previous-period";
  const trends = Object.fromEntries(
    EVENT_TYPES.map((type) => [
      type,
      plan.keys.map((key) => bucketCounts.get(key)?.[type] ?? 0),
    ]),
  ) as Record<DashboardEventType, number[]>;
  const emptyTrend = plan.keys.map(() => 0);
  const periodDelta = (current: number, previous: number) =>
    comparison === "none" ? null : percentageDelta(current, previous);
  const metrics: DashboardMetric[] = [
    {
      comparison,
      delta: periodDelta(currentCounts.delivered, previousCounts.delivered),
      id: "delivered",
      label: "Delivered",
      trend: trends.delivered,
      value: currentCounts.delivered,
    },
    {
      comparison,
      delta: periodDelta(currentCounts.opened, previousCounts.opened),
      id: "opened",
      label: "Opened",
      trend: trends.opened,
      value: currentCounts.opened,
    },
    {
      comparison,
      delta: null,
      id: "clicked",
      label: "Clicked",
      note: "Click events are not collected yet.",
      trend: emptyTrend,
      value: null,
    },
    {
      comparison,
      delta: periodDelta(currentCounts.bounced, previousCounts.bounced),
      id: "bounced",
      label: "Bounced",
      trend: trends.bounced,
      value: currentCounts.bounced,
    },
    {
      comparison,
      delta: periodDelta(currentCounts.complained, previousCounts.complained),
      id: "complained",
      label: "Spam complaints",
      trend: trends.complained,
      value: currentCounts.complained,
    },
  ];
  const series: DashboardSeriesPoint[] = plan.keys.map((key) => {
    const counts = bucketCounts.get(key) ?? emptyBucketCounts();
    return {
      bounced: counts.bounced,
      bucket: key,
      clicked: 0,
      complained: counts.complained,
      delivered: counts.delivered,
      opened: counts.opened,
    };
  });
  const activity: DashboardActivityPoint[] = series.map((point) => ({
    clicked: point.clicked,
    date:
      plan.bucket === "month"
        ? displayMonth(point.bucket, timeZone)
        : displayDate(point.bucket, timeZone),
    delivered: point.delivered,
    opened: point.opened,
  }));

  const recentIds = recentRows.map((message) => message.id);
  const recentEventRows = recentIds.length
    ? await db
        .selectDistinct({ messageId: events.messageId, type: events.type })
        .from(events)
        .where(inArray(events.messageId, recentIds))
    : [];
  const eventTypesByMessage = new Map<string, string[]>();

  for (const event of recentEventRows) {
    const types = eventTypesByMessage.get(event.messageId);

    if (types) {
      types.push(event.type);
    } else {
      eventTypesByMessage.set(event.messageId, [event.type]);
    }
  }

  return {
    activity,
    bucket: plan.bucket,
    metrics,
    recentEmails: recentRows.map((message) => ({
      createdAt: message.createdAt.toISOString(),
      id: message.id,
      recipient: message.recipient[0] ?? "No recipient",
      status: resolveDashboardEmailStatus(
        message.status,
        eventTypesByMessage.get(message.id) ?? [],
      ),
      subject: message.subject,
    })),
    series,
  };
}

export async function getPaperBoyDashboardExport(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  range: DashboardRange;
  timeZone: string;
}): Promise<PaperBoyDashboardExport> {
  const timeZone = normalizeTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const dashboard = await getPaperBoyDashboard({ ...input, now, timeZone });
  const today = localDateKey(now, timeZone);
  const window = dashboardWindow({ range: input.range, today });
  const currentStart = window.currentStartKey
    ? rangeBoundary(window.currentStartKey, timeZone)
    : null;
  const end = rangeBoundary(window.endKey, timeZone);
  const messageRows = await db
    .select({
      createdAt: messages.createdAt,
      id: messages.id,
      recipient: messages.to,
      status: messages.status,
      subject: messages.subject,
    })
    .from(messages)
    .where(
      and(
        eq(messages.orgId, input.orgId),
        currentStart ? gte(messages.createdAt, currentStart) : undefined,
        lt(messages.createdAt, end),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(DASHBOARD_EXPORT_MESSAGE_LIMIT + 1);
  const messagesTruncated = messageRows.length > DASHBOARD_EXPORT_MESSAGE_LIMIT;

  return {
    dashboard,
    messages: messageRows.slice(0, DASHBOARD_EXPORT_MESSAGE_LIMIT).map((message) => ({
      createdAt: message.createdAt.toISOString(),
      id: message.id,
      recipient: message.recipient[0] ?? "No recipient",
      status: message.status,
      subject: message.subject,
    })),
    messagesTruncated,
  };
}
