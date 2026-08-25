import * as chrono from "chrono-node";
import { normalizeTimeZone, parseLocalDateTime } from "@/lib/time";

export type NaturalLanguageScheduleResult =
  | { date: Date; error: null; label: string }
  | { date: null; error: string; label: null };

const WEEKDAY_PATTERN =
  /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i;

export function formatNaturalLanguageSchedule(
  value: Date | string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    timeZone: normalizeTimeZone(timeZone),
    timeZoneName: "short",
    weekday: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function naturalLanguageScheduleInput(
  value: Date | string,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "long",
    timeZone: normalizeTimeZone(timeZone),
    weekday: "long",
    year: "numeric",
  }).format(new Date(value));
}

export function parseNaturalLanguageSchedule(
  value: unknown,
  reference: Date,
  timeZone: string,
): NaturalLanguageScheduleResult {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 200) {
    return {
      date: null,
      error: "Type one future date and time.",
      label: null,
    };
  }

  const zone = normalizeTimeZone(timeZone);
  const results = chrono.en.GB.parse(
    text,
    { instant: reference, timezone: zone },
    { forwardDate: true },
  );
  if (results.length !== 1) {
    return {
      date: null,
      error: "Type one unambiguous future date and time.",
      label: null,
    };
  }

  const result = results[0];
  if (!result.start.isCertain("day") || !result.start.isCertain("hour")) {
    return {
      date: null,
      error: "Include both a day and time.",
      label: null,
    };
  }

  const localParts = {
    day: result.start.get("day"),
    hour: result.start.get("hour"),
    minute: result.start.get("minute") ?? 0,
    month: result.start.get("month"),
    year: result.start.get("year"),
  };
  if (
    localParts.year === null ||
    localParts.month === null ||
    localParts.day === null ||
    localParts.hour === null
  ) {
    return {
      date: null,
      error: "Type one unambiguous future date and time.",
      label: null,
    };
  }
  const date = parseLocalDateTime(
    [
      String(localParts.year).padStart(4, "0"),
      String(localParts.month).padStart(2, "0"),
      String(localParts.day).padStart(2, "0"),
    ].join("-") +
      `T${String(localParts.hour).padStart(2, "0")}:${String(localParts.minute).padStart(2, "0")}`,
    zone,
  );
  if (!date) {
    return {
      date: null,
      error: "That local time does not exist in this timezone.",
      label: null,
    };
  }
  if (date <= reference) {
    return {
      date: null,
      error: "Choose a future date and time.",
      label: null,
    };
  }

  const requestedWeekday = WEEKDAY_PATTERN.exec(text)?.[1];
  if (requestedWeekday) {
    const actualWeekday = new Intl.DateTimeFormat("en-AU", {
      timeZone: zone,
      weekday: "long",
    }).format(date);
    if (requestedWeekday.toLowerCase() !== actualWeekday.toLowerCase()) {
      const calendarDate = new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "long",
        timeZone: zone,
        year: "numeric",
      }).format(date);
      return {
        date: null,
        error: `${calendarDate} is ${actualWeekday}, not ${requestedWeekday}.`,
        label: null,
      };
    }
  }

  return {
    date,
    error: null,
    label: formatNaturalLanguageSchedule(date, zone),
  };
}
