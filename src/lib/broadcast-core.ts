import { normalizeEmailAddress } from "@/lib/email-core";

export const MAX_BROADCAST_NAME_LENGTH = 120;
export const MAX_BROADCAST_RECIPIENTS = 100;

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

export const SUPPRESSION_REASONS = [
  "manual",
  "bounced",
  "complained",
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

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

export type BroadcastAudienceMember = {
  data: Record<string, unknown>;
  email: string;
  position: number;
};

export type CreateBroadcastInput = {
  audience: BroadcastAudienceMember[];
  from: string;
  name: string;
  templateId: string;
};

const CREATE_FIELDS = new Set(["audience", "from", "name", "template_id"]);
const AUDIENCE_FIELDS = new Set(["data", "email"]);
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

  if (!Array.isArray(value.audience)) {
    issues.push({
      field: "audience",
      message: "Provide an array of audience members.",
    });
  } else if (
    value.audience.length === 0 ||
    value.audience.length > MAX_BROADCAST_RECIPIENTS
  ) {
    issues.push({
      field: "audience",
      message: `Provide 1-${MAX_BROADCAST_RECIPIENTS} audience members.`,
    });
  }

  const audience: BroadcastAudienceMember[] = [];
  const seen = new Set<string>();

  if (Array.isArray(value.audience)) {
    value.audience.slice(0, MAX_BROADCAST_RECIPIENTS).forEach((candidate, position) => {
      const field = `audience.${position}`;

      if (!isRecord(candidate)) {
        issues.push({ field, message: "Must be an object." });
        return;
      }

      Object.keys(candidate)
        .filter((key) => !AUDIENCE_FIELDS.has(key))
        .forEach((key) => {
          issues.push({
            field: `${field}.${key}`,
            message: "This field is not supported.",
          });
        });

      const email = normalizeEmailAddress(candidate.email);

      if (!email) {
        issues.push({
          field: `${field}.email`,
          message: "Enter a valid email address.",
        });
      } else if (seen.has(email)) {
        issues.push({
          field: `${field}.email`,
          message: "Each audience email must be unique.",
        });
      } else {
        seen.add(email);
      }

      const data = candidate.data === undefined ? {} : candidate.data;

      if (!isRecord(data)) {
        issues.push({
          field: `${field}.data`,
          message: "Must be a JSON object.",
        });
      }

      if (email && isRecord(data)) {
        audience.push({ data, email, position });
      }
    });
  }

  if (issues.length > 0) {
    throw new BroadcastError("VALIDATION_ERROR", issues.slice(0, 100));
  }

  return { audience, from, name, templateId };
}
