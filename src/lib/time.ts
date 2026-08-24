export const DEFAULT_TIME_ZONE = "Australia/Sydney";

const calendarFormatters = new Map<string, Intl.DateTimeFormat>();

export function canonicalTimeZone(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 100 ||
    !/^[A-Za-z0-9_+\-/]+$/.test(value)
  ) {
    return null;
  }

  try {
    return new Intl.DateTimeFormat("en-AU", { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    return null;
  }
}

export function normalizeTimeZone(value: unknown): string {
  return canonicalTimeZone(value) ?? DEFAULT_TIME_ZONE;
}

export function browserTimeZone(): string {
  return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

function calendarDateParts(value: unknown): {
  day: number;
  month: number;
  year: number;
} | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { day, month, year };
}

function calendarDateString(value: Date, timeZone: string): string {
  let formatter = calendarFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      calendar: "iso8601",
      day: "2-digit",
      month: "2-digit",
      numberingSystem: "latn",
      timeZone,
      year: "numeric",
    });
    calendarFormatters.set(timeZone, formatter);
  }
  const values = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function startOfCalendarDate(
  value: unknown,
  timeZone: unknown,
): Date | null {
  const parts = calendarDateParts(value);
  const zone = canonicalTimeZone(timeZone);
  if (!parts || !zone || typeof value !== "string") return null;

  const approximate = Date.UTC(parts.year, parts.month - 1, parts.day);
  let lower = approximate - 48 * 60 * 60 * 1_000;
  let upper = approximate + 48 * 60 * 60 * 1_000;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (calendarDateString(new Date(middle), zone) < value) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }

  const boundary = new Date(lower);
  return calendarDateString(boundary, zone) === value ? boundary : null;
}

export function startOfNextCalendarDate(
  value: unknown,
  timeZone: unknown,
): Date | null {
  const parts = calendarDateParts(value);
  if (!parts) return null;
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  const nextValue = [
    String(next.getUTCFullYear()).padStart(4, "0"),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("-");
  return startOfCalendarDate(nextValue, timeZone);
}

export function formatDateTime(
  value: Date | number | string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: normalizeTimeZone(timeZone),
    timeZoneName: "short",
    year: "numeric",
  }).format(new Date(value));
}

export function protocolTimestamp(value: Date | number | string): string {
  return new Date(value).toISOString();
}
