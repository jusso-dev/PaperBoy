import type { ApiKeyEnvironment } from "@/lib/api-key-crypto";

export const DEFAULT_LIVE_RATE_LIMIT_PER_MINUTE = 60;
export const DEFAULT_TEST_RATE_LIMIT_PER_MINUTE = 600;
export const MAX_RATE_LIMIT_PER_MINUTE = 1_000_000;

export type RateLimitValidationIssue = {
  field: string;
  message: string;
};

export type RateLimitSettings = {
  defaultLiveLimitPerMinute: number;
  defaultTestLimitPerMinute: number;
  liveLimitPerMinute: number;
  liveOverridePerMinute: number | null;
  testLimitPerMinute: number;
  testOverridePerMinute: number | null;
  updatedAt: Date;
};

export type UpdateRateLimitInput = {
  liveLimitPerMinute?: number | null;
  testLimitPerMinute?: number | null;
};

export class RateLimitConfigurationError extends Error {
  constructor() {
    super("PaperBoy rate-limit configuration is invalid.");
    this.name = "RateLimitConfigurationError";
  }
}

export class RateLimitError extends Error {
  readonly code = "RATE_LIMIT_EXCEEDED";

  constructor(
    readonly environment: ApiKeyEnvironment,
    readonly limit: number,
    readonly retryAfterSeconds: number,
  ) {
    super("RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
  }
}

export class RateLimitSettingsError extends Error {
  constructor(
    readonly code: "MEMBERSHIP_REQUIRED" | "VALIDATION_ERROR",
    readonly issues: RateLimitValidationIssue[] = [],
  ) {
    super(code);
    this.name = "RateLimitSettingsError";
  }
}

function configuredLimit(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) throw new RateLimitConfigurationError();
  const limit = Number(raw);
  if (
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > MAX_RATE_LIMIT_PER_MINUTE
  ) {
    throw new RateLimitConfigurationError();
  }
  return limit;
}

export function configuredRateLimitDefaults(input: {
  live?: string;
  test?: string;
} = {}): { live: number; test: number } {
  const live = configuredLimit(
    input.live ?? process.env.PAPERBOY_LIVE_RATE_LIMIT_PER_MINUTE,
    DEFAULT_LIVE_RATE_LIMIT_PER_MINUTE,
  );
  const test = configuredLimit(
    input.test ?? process.env.PAPERBOY_TEST_RATE_LIMIT_PER_MINUTE,
    DEFAULT_TEST_RATE_LIMIT_PER_MINUTE,
  );
  if (test <= live) throw new RateLimitConfigurationError();
  return { live, test };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function inputLimit(
  value: unknown,
  field: string,
  issues: RateLimitValidationIssue[],
): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > MAX_RATE_LIMIT_PER_MINUTE
  ) {
    issues.push({
      field,
      message: `Must be null or a whole number from 1 to ${MAX_RATE_LIMIT_PER_MINUTE}.`,
    });
    return undefined;
  }
  return value;
}

export function parseUpdateRateLimitInput(
  value: unknown,
): UpdateRateLimitInput {
  if (!isRecord(value)) {
    throw new RateLimitSettingsError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const allowed = new Set([
    "live_limit_per_minute",
    "test_limit_per_minute",
  ]);
  const issues = Object.keys(value)
    .filter((field) => !allowed.has(field))
    .map((field) => ({ field, message: "This field is not supported." }));
  const result: UpdateRateLimitInput = {};

  if (Object.hasOwn(value, "live_limit_per_minute")) {
    const limit = inputLimit(
      value.live_limit_per_minute,
      "live_limit_per_minute",
      issues,
    );
    if (limit !== undefined) result.liveLimitPerMinute = limit;
  }
  if (Object.hasOwn(value, "test_limit_per_minute")) {
    const limit = inputLimit(
      value.test_limit_per_minute,
      "test_limit_per_minute",
      issues,
    );
    if (limit !== undefined) result.testLimitPerMinute = limit;
  }
  if (
    !Object.hasOwn(value, "live_limit_per_minute") &&
    !Object.hasOwn(value, "test_limit_per_minute")
  ) {
    issues.push({
      field: "body",
      message: "Provide a live or test limit to update; use null to restore its default.",
    });
  }
  if (issues.length > 0) {
    throw new RateLimitSettingsError("VALIDATION_ERROR", issues);
  }
  return result;
}

export function effectiveRateLimits(input: {
  defaults?: { live: number; test: number };
  liveOverride: number | null;
  testOverride: number | null;
}): { live: number; test: number } {
  const defaults = input.defaults ?? configuredRateLimitDefaults();
  const live = input.liveOverride ?? defaults.live;
  const test = input.testOverride ?? defaults.test;
  if (test <= live) throw new RateLimitConfigurationError();
  return { live, test };
}
