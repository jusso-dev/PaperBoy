import { normalizeEmailAddress } from "@/lib/email-core";

export const MAX_BROADCAST_NAME_LENGTH = 120;
export const MAX_BROADCAST_SCHEDULE_AHEAD_MS = 366 * 24 * 60 * 60 * 1_000;

export const BROADCAST_STATUSES = [
  "scheduled",
  "running",
  "paused",
  "completed",
  "cancelled",
] as const;
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number];

export const BROADCAST_RECIPIENT_STATUSES = [
  "pending",
  "processing",
  "queued",
  "suppressed",
  "failed",
  "cancelled",
] as const;
export type BroadcastRecipientStatus =
  (typeof BROADCAST_RECIPIENT_STATUSES)[number];

export type BroadcastValidationIssue = {
  field: string;
  message: string;
};

export type BroadcastErrorCode =
  | "BROADCAST_NOT_FOUND"
  | "INVALID_TRANSITION"
  | "MEMBERSHIP_REQUIRED"
  | "VALIDATION_ERROR";

export class BroadcastError extends Error {
  constructor(
    readonly code: BroadcastErrorCode,
    readonly issues: BroadcastValidationIssue[] = [],
  ) {
    super(code);
    this.name = "BroadcastError";
  }
}

export type CreateBroadcastInput = {
  audienceId: string;
  from: string;
  name: string;
  scheduledFor: Date | null;
  templateId: string;
};

const CREATE_FIELDS = new Set([
  "audience_id",
  "from",
  "name",
  "scheduled_for",
  "template_id",
]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseCreateBroadcastInput(value: unknown): CreateBroadcastInput {
  if (!isRecord(value)) {
    throw new BroadcastError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues: BroadcastValidationIssue[] = [];
  const unsupported = Object.keys(value).filter(
    (field) => !CREATE_FIELDS.has(field),
  );

  unsupported.forEach((field) => {
    issues.push({ field, message: "This field is not supported." });
  });

  const name = typeof value.name === "string" ? value.name.trim() : "";

  if (
    !name ||
    name.length > MAX_BROADCAST_NAME_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(name)
  ) {
    issues.push({
      field: "name",
      message: `Enter a name of at most ${MAX_BROADCAST_NAME_LENGTH} characters without control characters.`,
    });
  }

  const from = typeof value.from === "string" ? value.from.trim() : "";

  if (!from || !normalizeEmailAddress(from)) {
    issues.push({
      field: "from",
      message: "Enter a sender such as Newsroom <news@example.com>.",
    });
  }

  const templateId =
    typeof value.template_id === "string" ? value.template_id : "";

  if (!UUID_PATTERN.test(templateId)) {
    issues.push({
      field: "template_id",
      message: "Provide a valid template UUID.",
    });
  }

  const audienceId =
    typeof value.audience_id === "string" ? value.audience_id : "";

  if (!UUID_PATTERN.test(audienceId)) {
    issues.push({
      field: "audience_id",
      message: "Provide a valid audience UUID.",
    });
  }

  let scheduledFor: Date | null = null;
  if (Object.hasOwn(value, "scheduled_for")) {
    const raw = value.scheduled_for;
    const parsed =
      typeof raw === "string" && RFC3339_PATTERN.test(raw)
        ? new Date(raw)
        : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      issues.push({
        field: "scheduled_for",
        message: "Use an RFC 3339 timestamp with an explicit UTC offset.",
      });
    } else {
      scheduledFor = parsed;
    }
  }

  if (issues.length > 0) {
    throw new BroadcastError("VALIDATION_ERROR", issues.slice(0, 100));
  }

  return { audienceId, from, name, scheduledFor, templateId };
}
