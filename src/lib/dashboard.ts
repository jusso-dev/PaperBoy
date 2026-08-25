import "server-only";

import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
} from "drizzle-orm";
import { db } from "@/db";
import { events, messages } from "@/db/schema";
import {
  resolveDashboardEmailStatus,
  type DashboardEmailStatus,
} from "@/lib/dashboard-status";
import { requireMessageRead } from "@/lib/message-statuses";
import { normalizeTimeZone, startOfCalendarDate } from "@/lib/time";

export type { DashboardEmailStatus } from "@/lib/dashboard-status";

export const DASHBOARD_RANGES = [7, 14, 30] as const;
export type DashboardRangeDays = (typeof DASHBOARD_RANGES)[number];

export type DashboardMetric = {
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

export type DashboardEmail = {
  createdAt: string;
  id: string;
  recipient: string;
  status: DashboardEmailStatus;
  subject: string;
};

export type PaperBoyDashboard = {
  activity: DashboardActivityPoint[];
  metrics: DashboardMetric[];
  recentEmails: DashboardEmail[];
};

type DashboardEventType =
  | "bounced"
  | "complained"
  | "delivered"
  | "opened";

function localDateKey(value: Date, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
    })
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function shiftDateKey(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function rangeBoundary(value: string, timeZone: string): Date {
  const boundary = startOfCalendarDate(value, timeZone);

  if (!boundary) {
    throw new Error(`Unable to resolve dashboard date ${value}.`);
  }

  return boundary;
}

function percentageDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function displayDate(dateKey: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(rangeBoundary(dateKey, timeZone));
}

export function parseDashboardRange(value: string | undefined): DashboardRangeDays {
  const parsed = Number(value);
  return DASHBOARD_RANGES.includes(parsed as DashboardRangeDays)
    ? (parsed as DashboardRangeDays)
    : 7;
}

export function dashboardRangeLabel(input: {
  now: Date;
  rangeDays: DashboardRangeDays;
  timeZone: string;
}): string {
  const timeZone = normalizeTimeZone(input.timeZone);
  const endKey = localDateKey(input.now, timeZone);
  const startKey = shiftDateKey(endKey, -(input.rangeDays - 1));
  const start = rangeBoundary(startKey, timeZone);
  const end = rangeBoundary(endKey, timeZone);
  const startParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      timeZone,
      year: "numeric",
    })
      .formatToParts(start)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  const endParts = Object.fromEntries(
    new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      timeZone,
      year: "numeric",
    })
      .formatToParts(end)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  if (startParts.month === endParts.month && startParts.year === endParts.year) {
    return `${startParts.day}–${endParts.day} ${endParts.month} ${endParts.year}`;
  }

  return `${startParts.day} ${startParts.month} – ${endParts.day} ${endParts.month} ${endParts.year}`;
}

export async function getPaperBoyDashboard(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  rangeDays: DashboardRangeDays;
  timeZone: string;
}): Promise<PaperBoyDashboard> {
  const timeZone = normalizeTimeZone(input.timeZone);
  const now = input.now ?? new Date();
  const today = localDateKey(now, timeZone);
  const currentStartKey = shiftDateKey(today, -(input.rangeDays - 1));
  const previousStartKey = shiftDateKey(currentStartKey, -input.rangeDays);
  const endKey = shiftDateKey(today, 1);
  const currentStart = rangeBoundary(currentStartKey, timeZone);
  const previousStart = rangeBoundary(previousStartKey, timeZone);
  const end = rangeBoundary(endKey, timeZone);

  // Reuse the established permission boundary before dashboard-only queries.
  await requireMessageRead({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
  });

  const [eventRows, recentRows] = await Promise.all([
    db
      .select({
        createdAt: events.createdAt,
        type: events.type,
      })
      .from(events)
      .innerJoin(messages, eq(events.messageId, messages.id))
      .where(
        and(
          eq(messages.orgId, input.orgId),
          gte(events.createdAt, previousStart),
          lt(events.createdAt, end),
        ),
      )
      .orderBy(desc(events.createdAt), desc(events.sequence)),
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

  const currentKeys = Array.from({ length: input.rangeDays }, (_, index) =>
    shiftDateKey(currentStartKey, index),
  );
  const eventTypes: DashboardEventType[] = [
    "delivered",
    "opened",
    "bounced",
    "complained",
  ];
  const currentCounts = Object.fromEntries(
    eventTypes.map((type) => [type, 0]),
  ) as Record<DashboardEventType, number>;
  const previousCounts = Object.fromEntries(
    eventTypes.map((type) => [type, 0]),
  ) as Record<DashboardEventType, number>;
  const dailyCounts = new Map(
    currentKeys.map((key) => [
      key,
      { bounced: 0, complained: 0, delivered: 0, opened: 0 },
    ]),
  );

  for (const event of eventRows) {
    if (!eventTypes.includes(event.type as DashboardEventType)) continue;
    const type = event.type as DashboardEventType;
    const key = localDateKey(event.createdAt, timeZone);

    if (event.createdAt >= currentStart) {
      currentCounts[type] += 1;
      const day = dailyCounts.get(key);
      if (day) day[type] += 1;
    } else {
      previousCounts[type] += 1;
    }
  }

  const trends = Object.fromEntries(
    eventTypes.map((type) => [
      type,
      currentKeys.map((key) => dailyCounts.get(key)?.[type] ?? 0),
    ]),
  ) as Record<DashboardEventType, number[]>;
  const emptyTrend = currentKeys.map(() => 0);
  const metrics: DashboardMetric[] = [
    {
      delta: percentageDelta(currentCounts.delivered, previousCounts.delivered),
      id: "delivered",
      label: "Delivered",
      trend: trends.delivered,
      value: currentCounts.delivered,
    },
    {
      delta: percentageDelta(currentCounts.opened, previousCounts.opened),
      id: "opened",
      label: "Opened",
      trend: trends.opened,
      value: currentCounts.opened,
    },
    {
      delta: null,
      id: "clicked",
      label: "Clicked",
      note: "Click events are not collected yet.",
      trend: emptyTrend,
      value: null,
    },
    {
      delta: percentageDelta(currentCounts.bounced, previousCounts.bounced),
      id: "bounced",
      label: "Bounced",
      trend: trends.bounced,
      value: currentCounts.bounced,
    },
    {
      delta: percentageDelta(currentCounts.complained, previousCounts.complained),
      id: "complained",
      label: "Spam complaints",
      trend: trends.complained,
      value: currentCounts.complained,
    },
  ];
  const activity: DashboardActivityPoint[] = currentKeys.map((key) => ({
    clicked: 0,
    date: displayDate(key, timeZone),
    delivered: dailyCounts.get(key)?.delivered ?? 0,
    opened: dailyCounts.get(key)?.opened ?? 0,
  }));

  const recentIds = recentRows.map((message) => message.id);
  const recentEventRows = recentIds.length
    ? await db
        .select({ messageId: events.messageId, type: events.type })
        .from(events)
        .where(inArray(events.messageId, recentIds))
        .orderBy(desc(events.createdAt), desc(events.sequence))
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
  };
}
