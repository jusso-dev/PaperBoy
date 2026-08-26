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
