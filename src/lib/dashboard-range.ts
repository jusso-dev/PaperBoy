import { normalizeTimeZone, startOfCalendarDate } from "@/lib/time";

export const DASHBOARD_RANGE_PRESETS = [7, 14, 30] as const;
export const DASHBOARD_RANGE_ALL = "all" as const;
export const DASHBOARD_RANGES = [...DASHBOARD_RANGE_PRESETS, DASHBOARD_RANGE_ALL] as const;
export const ALL_TIME_DAILY_MAX_DAYS = 90;

export type DashboardRangeDays = (typeof DASHBOARD_RANGE_PRESETS)[number];
export type DashboardRange = (typeof DASHBOARD_RANGES)[number];
export type DashboardBucket = "day" | "month";

export type DashboardWindow = {
  currentStartKey: string | null;
  endKey: string;
  previousStartKey: string | null;
};

export type DashboardSeriesPlan = {
  bucket: DashboardBucket;
  keys: string[];
};

export function isDashboardRangeDays(value: unknown): value is DashboardRangeDays {
  return DASHBOARD_RANGE_PRESETS.includes(value as DashboardRangeDays);
}

export function parseDashboardRange(value: string | undefined): DashboardRange {
  if (value === DASHBOARD_RANGE_ALL) return DASHBOARD_RANGE_ALL;
  const parsed = Number(value);
  return isDashboardRangeDays(parsed) ? parsed : 7;
}

export function dashboardRangeParam(range: DashboardRange): string {
  return range === DASHBOARD_RANGE_ALL ? DASHBOARD_RANGE_ALL : String(range);
}

export function localDateKey(value: Date, timeZone: string): string {
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

export function shiftDateKey(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
    String(shifted.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export function shiftMonthKey(value: string, months: number): string {
  const [year, month] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + months, 1));
  return [
    shifted.getUTCFullYear(),
    String(shifted.getUTCMonth() + 1).padStart(2, "0"),
  ].join("-");
}

export function rangeBoundary(value: string, timeZone: string): Date {
  const boundary = startOfCalendarDate(value, timeZone);

  if (!boundary) {
    throw new Error(`Unable to resolve dashboard date ${value}.`);
  }

  return boundary;
}

export function displayDate(dateKey: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(rangeBoundary(dateKey, timeZone));
}

export function displayMonth(monthKey: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    timeZone,
    year: "numeric",
  }).format(rangeBoundary(`${monthKey}-01`, timeZone));
}

export function daySpan(startKey: string, endKey: string): number {
  const [startYear, startMonth, startDay] = startKey.split("-").map(Number);
  const [endYear, endMonth, endDay] = endKey.split("-").map(Number);
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const end = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.round((end - start) / 86_400_000) + 1;
}

export function dayKeysInclusive(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  for (let key = startKey; key <= endKey; key = shiftDateKey(key, 1)) {
    keys.push(key);
    if (keys.length > 400) break;
  }
  return keys;
}

export function monthKeysInclusive(startKey: string, endKey: string): string[] {
  const keys: string[] = [];
  for (
    let key = startKey.slice(0, 7);
    key <= endKey.slice(0, 7);
    key = shiftMonthKey(key, 1)
  ) {
    keys.push(key);
    if (keys.length > 240) break;
  }
  return keys;
}

export function dashboardWindow(input: {
  range: DashboardRange;
  today: string;
}): DashboardWindow {
  const endKey = shiftDateKey(input.today, 1);

  if (input.range === DASHBOARD_RANGE_ALL) {
    return {
      currentStartKey: null,
      endKey,
      previousStartKey: null,
    };
  }

  const currentStartKey = shiftDateKey(input.today, -(input.range - 1));
  return {
    currentStartKey,
    endKey,
    previousStartKey: shiftDateKey(currentStartKey, -input.range),
  };
}

export function dashboardSeriesPlan(input: {
  firstDateKey: string | null;
  range: DashboardRange;
  today: string;
}): DashboardSeriesPlan {
  if (input.range !== DASHBOARD_RANGE_ALL) {
    return {
      bucket: "day",
      keys: dayKeysInclusive(
        shiftDateKey(input.today, -(input.range - 1)),
        input.today,
      ),
    };
  }

  if (!input.firstDateKey) {
    return { bucket: "day", keys: [input.today] };
  }

  if (daySpan(input.firstDateKey, input.today) <= ALL_TIME_DAILY_MAX_DAYS) {
    return {
      bucket: "day",
      keys: dayKeysInclusive(input.firstDateKey, input.today),
    };
  }

  return {
    bucket: "month",
    keys: monthKeysInclusive(input.firstDateKey, input.today),
  };
}

export function dashboardRangeLabel(input: {
  now: Date;
  range: DashboardRange;
  timeZone: string;
}): string {
  if (input.range === DASHBOARD_RANGE_ALL) return "All time";

  const timeZone = normalizeTimeZone(input.timeZone);
  const endKey = localDateKey(input.now, timeZone);
  const startKey = shiftDateKey(endKey, -(input.range - 1));
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
