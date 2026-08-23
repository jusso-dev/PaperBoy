import { normalizeEmailAddress } from "@/lib/email-core";
import { MAX_AUDIENCE_CONTACTS } from "@/lib/audience-core";

export const MAX_BROADCAST_NAME_LENGTH = 120;
export const MAX_BROADCAST_RECIPIENTS = MAX_AUDIENCE_CONTACTS;

export const BROADCAST_STATUSES = [
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
  templateId: string;
};

const CREATE_FIELDS = new Set(["audience_id", "from", "name", "template_id"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  if (issues.length > 0) {
    throw new BroadcastError("VALIDATION_ERROR", issues.slice(0, 100));
  }

  return { audienceId, from, name, templateId };
}
