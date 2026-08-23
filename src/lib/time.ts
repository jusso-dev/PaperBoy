export const DEFAULT_TIME_ZONE = "UTC";

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
