import { createHash } from "node:crypto";
import { simpleParser, type AddressObject } from "mailparser";
import {
  EmailError,
  parseEmailAddressField,
  type EmailValidationIssue,
} from "@/lib/email-core";

export const MAX_INBOUND_RAW_BYTES = 2 * 1024 * 1024;

export type InboundEmailInput = {
  bcc: string[];
  cc: string[];
  contentSha256: string;
  from: string;
  html: string | null;
  rfc822MessageId: string | null;
  subject: string;
  text: string | null;
  to: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formattedAddresses(value: AddressObject | AddressObject[] | undefined) {
  const groups = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return groups.flatMap((group) =>
    (group.value ?? []).flatMap((entry) => {
      if (!entry.address) return [];
      const parsed = parseEmailAddressField(
        entry.name ? `${entry.name} <${entry.address}>` : entry.address,
      );
      return parsed ? [parsed.formatted] : [];
    }),
  );
}

function parseAddressInput(
  value: unknown,
  field: string,
  issues: EmailValidationIssue[],
): string[] {
  if (value === undefined) return [];
  const values = typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
  if (!values) {
    issues.push({ field, message: "Enter one address or an array of addresses." });
    return [];
  }

  return values.flatMap((candidate, index) => {
    const parsed = parseEmailAddressField(candidate);
    if (!parsed) {
      issues.push({
        field: `${field}.${index}`,
        message: "Enter a valid email address.",
      });
      return [];
    }
    return [parsed.formatted];
  });
}

function normalizeMessageId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/^<|>$/g, "").trim();
  if (
    trimmed.length < 3 ||
    trimmed.length > 998 ||
    /[\u0000-\u001f\u007f]/.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function boundedBody(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value.length > MAX_INBOUND_RAW_BYTES
    ? value.slice(0, MAX_INBOUND_RAW_BYTES)
    : value;
}

export function inboundEmailHash(input: Omit<InboundEmailInput, "contentSha256">) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        bcc: input.bcc,
        cc: input.cc,
        from: input.from,
        html: input.html,
        rfc822MessageId: input.rfc822MessageId,
        subject: input.subject,
        text: input.text,
        to: input.to,
      }),
    )
    .digest("hex");
}

export async function parseInboundEmailInput(
  value: unknown,
): Promise<InboundEmailInput> {
  if (!isRecord(value)) {
    throw new EmailError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  if (typeof value.email === "string") {
    return parseInboundMime(value.email);
  }

  const issues: EmailValidationIssue[] = [];
  const from = parseEmailAddressField(value.from);
  if (!from) {
    issues.push({
      field: "from",
      message: "Enter the original sender address.",
    });
  }

  const to = parseAddressInput(value.to, "to", issues);
  if (to.length === 0) {
    issues.push({
      field: "to",
      message: "Provide at least one recipient address.",
    });
  }

  const subject =
    typeof value.subject === "string" &&
    value.subject.trim().length > 0 &&
    value.subject.length <= 998 &&
    !/[\r\n]/.test(value.subject)
      ? value.subject
      : null;
  if (!subject) {
    issues.push({
      field: "subject",
      message: "Enter a single-line subject of at most 998 characters.",
    });
  }

  const html = boundedBody(value.html);
  const text = boundedBody(value.text);
  if (!(html && html.length > 0) && !(text && text.length > 0)) {
    issues.push({
      field: "body",
      message: "Provide non-empty html or text content.",
    });
  }

  if (issues.length > 0 || !from || !subject) {
    throw new EmailError("VALIDATION_ERROR", issues);
  }

  const parsed = {
    bcc: parseAddressInput(value.bcc, "bcc", issues),
    cc: parseAddressInput(value.cc, "cc", issues),
    from: from.formatted,
    html,
    rfc822MessageId: normalizeMessageId(value.message_id),
    subject,
    text,
    to,
  };

  if (issues.length > 0) {
    throw new EmailError("VALIDATION_ERROR", issues);
  }

  return {
    ...parsed,
    contentSha256: inboundEmailHash(parsed),
  };
}

export async function parseInboundMime(raw: string): Promise<InboundEmailInput> {
  if (raw.length === 0) {
    throw new EmailError("VALIDATION_ERROR", [
      { field: "email", message: "Provide a raw RFC 822 message." },
    ]);
  }

  if (Buffer.byteLength(raw, "utf8") > MAX_INBOUND_RAW_BYTES) {
    throw new EmailError("ATTACHMENTS_TOO_LARGE");
  }

  let mail;
  try {
    mail = await simpleParser(raw, {
      maxHtmlLengthToParse: MAX_INBOUND_RAW_BYTES,
      skipHtmlToText: true,
      skipImageLinks: true,
      skipTextLinks: true,
      skipTextToHtml: true,
    });
  } catch {
    throw new EmailError("VALIDATION_ERROR", [
      { field: "email", message: "The raw message could not be parsed." },
    ]);
  }

  const from = formattedAddresses(mail.from)[0];
  const to = formattedAddresses(mail.to);
  const subject =
    typeof mail.subject === "string" &&
    mail.subject.trim().length > 0 &&
    !/[\r\n]/.test(mail.subject)
      ? mail.subject.trim()
      : null;
  const html = boundedBody(typeof mail.html === "string" ? mail.html : null);
  const text = boundedBody(typeof mail.text === "string" ? mail.text : null);
  const issues: EmailValidationIssue[] = [];

  if (!from) {
    issues.push({ field: "from", message: "The message is missing a From address." });
  }
  if (to.length === 0) {
    issues.push({ field: "to", message: "The message is missing a To address." });
  }
  if (!subject) {
    issues.push({ field: "subject", message: "The message is missing a subject." });
  }
  if (!(html && html.length > 0) && !(text && text.length > 0)) {
    issues.push({
      field: "body",
      message: "The message needs html or text content.",
    });
  }

  if (issues.length > 0 || !from || !subject) {
    throw new EmailError("VALIDATION_ERROR", issues);
  }

  const parsed = {
    bcc: formattedAddresses(mail.bcc),
    cc: formattedAddresses(mail.cc),
    from,
    html,
    rfc822MessageId: normalizeMessageId(mail.messageId),
    subject,
    text,
    to,
  };

  return {
    ...parsed,
    contentSha256: createHash("sha256").update(raw, "utf8").digest("hex"),
  };
}

export function inboundEmailApiBody(record: {
  bcc: string[];
  cc: string[];
  createdAt: Date;
  from: string;
  html: string | null;
  id: string;
  messageId: string | null;
  subject: string;
  text: string | null;
  to: string[];
}) {
  return {
    bcc: record.bcc,
    cc: record.cc,
    created_at: record.createdAt.toISOString(),
    from: parseEmailAddressField(record.from)?.address ?? record.from,
    html: record.html,
    id: record.id,
    message_id: record.messageId,
    object: "email" as const,
    subject: record.subject,
    text: record.text,
    to: record.to.map(
      (address) => parseEmailAddressField(address)?.address ?? address,
    ),
  };
}

export function inboundRecipientDomains(addresses: string[]): string[] {
  return [
    ...new Set(
      addresses.flatMap((address) => {
        const parsed = parseEmailAddressField(address);
        return parsed ? [parsed.domain] : [];
      }),
    ),
  ];
}

export const INBOUND_SINKHOLE_REASONS = ["bounce", "auto_reply"] as const;
export type InboundSinkholeReason = (typeof INBOUND_SINKHOLE_REASONS)[number];

export type DiscardedInboundEmail = {
  discarded: true;
  reason: InboundSinkholeReason;
};

export function isDiscardedInboundEmail(
  value: object,
): value is DiscardedInboundEmail {
  return "discarded" in value && value.discarded === true;
}

const MAX_INBOUND_HEADER_CHARS = 32 * 1024;
const BOUNCE_LOCAL_PARTS = new Set([
  "mail-daemon",
  "mailer-daemon",
  "mailerdaemon",
  "postmaster",
]);
const AUTO_REPLY_HEADER_NAMES = [
  "x-autogenerated",
  "x-autoreply",
  "x-autorespond",
] as const;

function firstHeader(headers: Map<string, string[]>, name: string): string | null {
  return headers.get(name)?.[0] ?? null;
}

function parseRawHeaders(raw: string): Map<string, string[]> {
  const headerEnd = raw.search(/\r?\n\r?\n/);
  const block = (headerEnd === -1 ? raw : raw.slice(0, headerEnd)).slice(
    0,
    MAX_INBOUND_HEADER_CHARS,
  );
  const headers = new Map<string, string[]>();
  let currentName: string | null = null;

  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && currentName) {
      const values = headers.get(currentName);
      if (values && values.length > 0) {
        values[values.length - 1] = `${values[values.length - 1]} ${line.trim()}`;
      }
      continue;
    }

    const separator = line.indexOf(":");
    if (separator <= 0) {
      currentName = null;
      continue;
    }

    currentName = line.slice(0, separator).trim().toLowerCase();
    if (!currentName) {
      currentName = null;
      continue;
    }

    headers.set(currentName, [
      ...(headers.get(currentName) ?? []),
      line.slice(separator + 1).trim(),
    ]);
  }

  return headers;
}

function bounceLocalPart(from: string | null): boolean {
  if (!from) return false;
  const parsed = parseEmailAddressField(from);
  const local = (parsed?.address.split("@")[0] ?? from)
    .trim()
    .replace(/^<|>$/g, "")
    .toLowerCase();
  return BOUNCE_LOCAL_PARTS.has(local) || /mailer-daemon/i.test(from);
}

function subjectLooksLikeBounce(subject: string | null): boolean {
  if (!subject) return false;
  return /undeliverable|undelivered mail|delivery status notification|mail delivery failed|returned mail|delivery failure|failure notice|returned to sender/i.test(
    subject,
  );
}

function subjectLooksLikeAutoReply(subject: string | null): boolean {
  if (!subject) return false;
  return /^(?:(?:automatic|auto)\s*reply|out of office|ooo\b|vacation|autoreply)\b/i.test(
    subject.trim(),
  );
}

function inboundSinkholeReasonFromHeaders(
  headers: Map<string, string[]>,
): InboundSinkholeReason | null {
  const autoSubmitted = (firstHeader(headers, "auto-submitted") ?? "")
    .trim()
    .toLowerCase();
  const contentType = (firstHeader(headers, "content-type") ?? "").toLowerCase();
  const from = firstHeader(headers, "from");
  const subject = firstHeader(headers, "subject");
  const precedence = (firstHeader(headers, "precedence") ?? "").trim().toLowerCase();
  const reportType = /multipart\/report/.test(contentType)
    ? /report-type\s*=\s*"?(delivery-status|feedback-report|disposition-notification)/i.exec(
        contentType,
      )?.[1] ?? null
    : null;

  if (
    reportType === "delivery-status" ||
    reportType === "feedback-report" ||
    reportType === "disposition-notification" ||
    firstHeader(headers, "x-failed-recipients") ||
    autoSubmitted === "auto-generated" ||
    bounceLocalPart(from) ||
    subjectLooksLikeBounce(subject)
  ) {
    return "bounce";
  }

  if (
    autoSubmitted === "auto-replied" ||
    autoSubmitted === "auto-notified" ||
    precedence === "auto_reply" ||
    AUTO_REPLY_HEADER_NAMES.some((name) => headers.has(name)) ||
    subjectLooksLikeAutoReply(subject)
  ) {
    return "auto_reply";
  }

  return null;
}

export function inboundSinkholeReasonFromRaw(
  raw: string,
): InboundSinkholeReason | null {
  if (raw.length === 0) return null;
  return inboundSinkholeReasonFromHeaders(parseRawHeaders(raw));
}

export function inboundSinkholeReasonFromFields(input: {
  from?: unknown;
  subject?: unknown;
}): InboundSinkholeReason | null {
  const from = typeof input.from === "string" ? input.from : null;
  const subject = typeof input.subject === "string" ? input.subject : null;

  if (bounceLocalPart(from) || subjectLooksLikeBounce(subject)) {
    return "bounce";
  }
  if (subjectLooksLikeAutoReply(subject)) {
    return "auto_reply";
  }
  return null;
}

export function inboundSinkholeReasonFromPayload(
  payload: unknown,
): InboundSinkholeReason | null {
  if (typeof payload === "string") {
    return inboundSinkholeReasonFromRaw(payload);
  }
  if (!isRecord(payload)) return null;
  if (typeof payload.email === "string") {
    return inboundSinkholeReasonFromRaw(payload.email);
  }
  return inboundSinkholeReasonFromFields({
    from: payload.from,
    subject: payload.subject,
  });
}
