import { createHash } from "node:crypto";
import { normalizeSendingDomain } from "@/lib/domain-core";

export const MESSAGE_STATUSES = [
  "queued",
  "sending",
  "sent",
  "failed",
] as const;
export type MessageStatus = (typeof MESSAGE_STATUSES)[number];

export const MESSAGE_DELIVERY_MODES = ["live", "test-sink"] as const;
export type MessageDeliveryMode = (typeof MESSAGE_DELIVERY_MODES)[number];

export type EmailTag = {
  name: string;
  value: string;
};

export type EmailAttachment = {
  content: Buffer;
  contentSha256: string;
  contentType: string;
  filename: string;
  size: number;
};

export type SendEmailInput = {
  attachments: EmailAttachment[];
  from: string;
  fromAddress: string;
  fromDomain: string;
  html: string | null;
  subject: string;
  tags: EmailTag[];
  text: string | null;
  to: string[];
};

export type EmailValidationIssue = {
  field: string;
  message: string;
};

export type EmailErrorCode =
  | "ATTACHMENTS_TOO_LARGE"
  | "IDEMPOTENCY_CONFLICT"
  | "RECIPIENT_SUPPRESSED"
  | "VALIDATION_ERROR";

export class EmailError extends Error {
  constructor(
    readonly code: EmailErrorCode,
    readonly issues: EmailValidationIssue[] = [],
  ) {
    super(code);
    this.name = "EmailError";
  }
}

const MAX_ADDRESS_LENGTH = 254;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS = 100;
const MAX_BODY_LENGTH = 2 * 1024 * 1024;
const MAX_RECIPIENTS = 50;
const MAX_SUBJECT_LENGTH = 998;
const MAX_TAGS = 75;
const MAX_TAG_LENGTH = 256;
const SEND_FIELDS = new Set([
  "attachments",
  "from",
  "to",
  "subject",
  "html",
  "text",
  "tags",
]);
const LOCAL_PART_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/i;
const TAG_PATTERN = /^[A-Z0-9_-]+$/i;
const CONTENT_TYPE_PATTERN =
  /^[A-Z0-9!#$&^_.+-]+\/[A-Z0-9!#$&^_.+-]+$/i;
const MAX_ATTACHMENT_BASE64_LENGTH =
  Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseAddress(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const input = value.trim();

  if (!input || input.length > 320 || /[\r\n]/.test(input)) {
    return null;
  }

  const friendly = /^(.*?)\s*<([^<>]+)>$/.exec(input);
  const displayName = friendly?.[1].trim() ?? "";
  const address = (friendly?.[2] ?? input).trim();

  if (
    (!friendly && /[<>]/.test(address)) ||
    /[<>\r\n]/.test(displayName) ||
    address.length > MAX_ADDRESS_LENGTH
  ) {
    return null;
  }

  const at = address.lastIndexOf("@");

  if (at <= 0 || at !== address.indexOf("@")) {
    return null;
  }

  const localPart = address.slice(0, at);
  const domain = normalizeSendingDomain(address.slice(at + 1));

  if (
    !domain ||
    localPart.length > 64 ||
    localPart.startsWith(".") ||
    localPart.endsWith(".") ||
    localPart.includes("..") ||
    !LOCAL_PART_PATTERN.test(localPart)
  ) {
    return null;
  }

  const normalizedAddress = `${localPart}@${domain}`;

  return {
    address: normalizedAddress,
    domain,
    formatted: displayName
      ? `${displayName} <${normalizedAddress}>`
      : normalizedAddress,
  };
}

export function normalizeEmailAddress(value: unknown): string | null {
  return parseAddress(value)?.address.toLowerCase() ?? null;
}

function bodyValue(
  value: unknown,
  field: "html" | "text",
  issues: EmailValidationIssue[],
): string | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    issues.push({ field, message: "Must be a string." });
    return null;
  }

  if (value.length > MAX_BODY_LENGTH) {
    issues.push({ field, message: "Must not exceed 2 MiB." });
  }

  return value;
}

function parseTags(
  value: unknown,
  issues: EmailValidationIssue[],
): EmailTag[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push({ field: "tags", message: "Must be an array." });
    return [];
  }

  if (value.length > MAX_TAGS) {
    issues.push({ field: "tags", message: "Must contain at most 75 tags." });
  }

  const tags: EmailTag[] = [];

  value.slice(0, MAX_TAGS).forEach((candidate, index) => {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some((key) => key !== "name" && key !== "value")
    ) {
      issues.push({
        field: `tags.${index}`,
        message: "Must contain only name and value.",
      });
      return;
    }

    const { name, value: tagValue } = candidate;

    if (
      typeof name !== "string" ||
      name.length === 0 ||
      name.length > MAX_TAG_LENGTH ||
      !TAG_PATTERN.test(name)
    ) {
      issues.push({
        field: `tags.${index}.name`,
        message:
          "Use 1-256 ASCII letters, numbers, underscores, or dashes.",
      });
    }

    if (
      typeof tagValue !== "string" ||
      tagValue.length === 0 ||
      tagValue.length > MAX_TAG_LENGTH ||
      !TAG_PATTERN.test(tagValue)
    ) {
      issues.push({
        field: `tags.${index}.value`,
        message:
          "Use 1-256 ASCII letters, numbers, underscores, or dashes.",
      });
    }

    if (typeof name === "string" && typeof tagValue === "string") {
      tags.push({ name, value: tagValue });
    }
  });

  return tags;
}

function parseAttachments(
  value: unknown,
  issues: EmailValidationIssue[],
): EmailAttachment[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    issues.push({ field: "attachments", message: "Must be an array." });
    return [];
  }

  if (value.length > MAX_ATTACHMENTS) {
    issues.push({
      field: "attachments",
      message: `Must contain at most ${MAX_ATTACHMENTS} files.`,
    });
  }

  const attachments: EmailAttachment[] = [];
  let totalBytes = 0;

  value.slice(0, MAX_ATTACHMENTS).forEach((candidate, index) => {
    if (
      !isRecord(candidate) ||
      Object.keys(candidate).some(
        (key) =>
          key !== "content" &&
          key !== "content_type" &&
          key !== "filename",
      )
    ) {
      issues.push({
        field: `attachments.${index}`,
        message: "Must contain only content, content_type, and filename.",
      });
      return;
    }

    const content = candidate.content;
    const contentType = candidate.content_type;
    const filename = candidate.filename;
    let decoded: Buffer | null = null;

    if (typeof content !== "string" || content.length === 0) {
      issues.push({
        field: `attachments.${index}.content`,
        message: "Provide canonical Base64 file content.",
      });
    } else if (content.length > MAX_ATTACHMENT_BASE64_LENGTH) {
      throw new EmailError("ATTACHMENTS_TOO_LARGE");
    } else {
      decoded = Buffer.from(content, "base64");

      if (
        decoded.length === 0 ||
        decoded.toString("base64") !== content
      ) {
        issues.push({
          field: `attachments.${index}.content`,
          message: "Provide canonical Base64 file content.",
        });
        decoded = null;
      }
    }

    if (
      typeof filename !== "string" ||
      filename.length === 0 ||
      filename !== filename.trim() ||
      Buffer.byteLength(filename, "utf8") > 255 ||
      /[\\/\u0000-\u001f\u007f]/.test(filename) ||
      filename === "." ||
      filename === ".."
    ) {
      issues.push({
        field: `attachments.${index}.filename`,
        message:
          "Use a filename of at most 255 bytes without paths or control characters.",
      });
    }

    if (
      typeof contentType !== "string" ||
      contentType.length > 127 ||
      !CONTENT_TYPE_PATTERN.test(contentType)
    ) {
      issues.push({
        field: `attachments.${index}.content_type`,
        message: "Use a MIME type such as application/pdf or image/png.",
      });
    }

    if (
      decoded &&
      typeof filename === "string" &&
      typeof contentType === "string"
    ) {
      totalBytes += decoded.length;

      if (totalBytes > MAX_ATTACHMENT_BYTES) {
        throw new EmailError("ATTACHMENTS_TOO_LARGE");
      }

      attachments.push({
        content: decoded,
        contentSha256: createHash("sha256").update(decoded).digest("hex"),
        contentType: contentType.toLowerCase(),
        filename,
        size: decoded.length,
      });
    }
  });

  return attachments;
}

export function parseSendEmailInput(
  value: unknown,
  options: { allowAttachments?: boolean } = {},
): SendEmailInput {
  if (!isRecord(value)) {
    throw new EmailError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues: EmailValidationIssue[] = [];

  for (const field of Object.keys(value)) {
    if (!SEND_FIELDS.has(field)) {
      issues.push({ field, message: "This field is not supported." });
    }
  }

  if (value.attachments !== undefined && options.allowAttachments === false) {
    issues.push({
      field: "attachments",
      message: "Attachments are not supported by the batch endpoint.",
    });
  }

  const attachments =
    options.allowAttachments === false
      ? []
      : parseAttachments(value.attachments, issues);

  const parsedFrom = parseAddress(value.from);

  if (!parsedFrom) {
    issues.push({
      field: "from",
      message: "Enter a sender such as Name <sender@example.com>.",
    });
  }

  const recipientValues =
    typeof value.to === "string"
      ? [value.to]
      : Array.isArray(value.to)
        ? value.to
        : [];

  if (recipientValues.length === 0) {
    issues.push({
      field: "to",
      message: "Provide at least one recipient address.",
    });
  } else if (recipientValues.length > MAX_RECIPIENTS) {
    issues.push({ field: "to", message: "Provide at most 50 recipients." });
  }

  const recipients = recipientValues.flatMap((recipient, index) => {
    const parsed = parseAddress(recipient);

    if (!parsed) {
      issues.push({
        field: `to.${index}`,
        message: "Enter a valid recipient address.",
      });
      return [];
    }

    return [parsed.formatted];
  });

  const subject = value.subject;

  if (
    typeof subject !== "string" ||
    subject.trim().length === 0 ||
    subject.length > MAX_SUBJECT_LENGTH ||
    /[\r\n]/.test(subject)
  ) {
    issues.push({
      field: "subject",
      message: "Enter a single-line subject of at most 998 characters.",
    });
  }

  const html = bodyValue(value.html, "html", issues);
  const text = bodyValue(value.text, "text", issues);

  if (!(html && html.length > 0) && !(text && text.length > 0)) {
    issues.push({
      field: "body",
      message: "Provide non-empty html or text content.",
    });
  }

  const tags = parseTags(value.tags, issues);

  if (issues.length > 0 || !parsedFrom || typeof subject !== "string") {
    throw new EmailError("VALIDATION_ERROR", issues);
  }

  return {
    attachments,
    from: parsedFrom.formatted,
    fromAddress: parsedFrom.address,
    fromDomain: parsedFrom.domain,
    html,
    subject,
    tags,
    text,
    to: recipients,
  };
}

export function normalizeIdempotencyKey(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 256 ||
    !/^[\x21-\x7e]+$/.test(value)
  ) {
    throw new EmailError("VALIDATION_ERROR", [
      {
        field: "Idempotency-Key",
        message: "Use 1-256 visible ASCII characters without spaces.",
      },
    ]);
  }

  return value;
}

export function emailRequestHash(input: SendEmailInput): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        from: input.from,
        html: input.html,
        subject: input.subject,
        tags: input.tags,
        text: input.text,
        to: input.to,
        ...(input.attachments.length === 0
          ? {}
          : {
              attachments: input.attachments.map((attachment) => ({
                contentSha256: attachment.contentSha256,
                contentType: attachment.contentType,
                filename: attachment.filename,
                size: attachment.size,
              })),
            }),
      }),
    )
    .digest("hex");
}
