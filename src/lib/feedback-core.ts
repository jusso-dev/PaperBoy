import { createHash } from "node:crypto";
import {
  simpleParser,
  type AddressObject,
  type HeaderValue,
  type ParsedMail,
  type SimpleParserOptions,
} from "mailparser";
import { normalizeEmailAddress } from "@/lib/email-core";

export const MAX_FEEDBACK_REPORT_BYTES = 10 * 1024 * 1024;
export const MAX_FEEDBACK_REPORT_BASE64_LENGTH =
  Math.ceil(MAX_FEEDBACK_REPORT_BYTES / 3) * 4;

export const FEEDBACK_CLASSIFICATIONS = [
  "hard_bounce",
  "soft_bounce",
  "complaint",
] as const;

export type FeedbackClassification =
  (typeof FEEDBACK_CLASSIFICATIONS)[number];

export type ParsedFeedbackOutcome = {
  classification: FeedbackClassification;
  messageId: string;
  recipient: string;
  status: string | null;
};

export type ParsedFeedbackReport = {
  outcomes: ParsedFeedbackOutcome[];
  reportSha256: string;
};

export type FeedbackErrorCode =
  | "INVALID_REPORT"
  | "MEMBERSHIP_REQUIRED"
  | "NO_MATCHING_MESSAGE"
  | "REPORT_TOO_LARGE";

export class FeedbackError extends Error {
  constructor(readonly code: FeedbackErrorCode) {
    super(code);
    this.name = "FeedbackError";
  }
}

type HeaderFields = Map<string, string[]>;

function pushField(fields: HeaderFields, name: string, value: string): void {
  const normalized = name.toLowerCase();
  fields.set(normalized, [...(fields.get(normalized) ?? []), value.trim()]);
}

function parseHeaderBlocks(content: Buffer): HeaderFields[] {
  const blocks: HeaderFields[] = [];
  let current = new Map<string, string[]>();
  let currentName: string | null = null;

  const finish = () => {
    if (current.size > 0) {
      blocks.push(current);
    }
    current = new Map<string, string[]>();
    currentName = null;
  };

  for (const line of content.toString("utf8").split(/\r?\n/)) {
    if (line.length === 0) {
      finish();
      continue;
    }

    if (/^[ \t]/.test(line) && currentName) {
      const values = current.get(currentName);
      const index = (values?.length ?? 1) - 1;

      if (values && index >= 0) {
        values[index] = `${values[index]} ${line.trim()}`;
      }
      continue;
    }

    const separator = line.indexOf(":");

    if (separator <= 0) {
      currentName = null;
      continue;
    }

    currentName = line.slice(0, separator).trim().toLowerCase();
    pushField(current, currentName, line.slice(separator + 1));
  }

  finish();
  return blocks;
}

function firstField(fields: HeaderFields, name: string): string | null {
  return fields.get(name.toLowerCase())?.[0] ?? null;
}

function uuidFrom(value: string | null): string | null {
  if (!value) return null;
  const match = /(?:^|[^0-9a-f])([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})(?:[^0-9a-f]|$)/i.exec(
    value,
  );
  return match?.[1]?.toLowerCase() ?? null;
}

function messageIdsFromContent(content: Buffer): string[] {
  const ids: string[] = [];

  for (const line of content.toString("utf8").split(/\r?\n/)) {
    if (
      /^(?:original-envelope-id|original-message-id|x-paperboy-message-id)\s*:/i.test(line) ||
      /^message-id\s*:/i.test(line)
    ) {
      const id = uuidFrom(line);
      if (id) ids.push(id);
    }
  }

  return ids;
}

function messageIdFromHeader(value: HeaderValue | undefined): string | null {
  if (typeof value === "string") return uuidFrom(value);
  if (Array.isArray(value)) {
    return value.flatMap((entry) => uuidFrom(String(entry)) ?? []).at(0) ?? null;
  }
  return null;
}

function addressValues(value: AddressObject | AddressObject[] | undefined) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).flatMap((entry) =>
    entry.value.flatMap((address) => address.address ?? []),
  );
}

async function originalMessageMetadata(mail: ParsedMail): Promise<{
  messageIds: string[];
  recipients: string[];
}> {
  const messageIds: string[] = [];
  const recipients: string[] = [];
  const parserOptions = {
    keepDeliveryStatus: true,
    maxHtmlLengthToParse: MAX_FEEDBACK_REPORT_BYTES,
    skipHtmlToText: true,
    skipImageLinks: true,
    skipTextLinks: true,
    skipTextToHtml: true,
  } as SimpleParserOptions & { keepDeliveryStatus: boolean };

  for (const attachment of mail.attachments) {
    messageIds.push(...messageIdsFromContent(attachment.content));

    if (
      attachment.contentType !== "message/rfc822" &&
      attachment.contentType !== "text/rfc822-headers"
    ) {
      continue;
    }

    try {
      const original = await simpleParser(attachment.content, parserOptions);
      const id =
        messageIdFromHeader(original.headers.get("x-paperboy-message-id")) ??
        uuidFrom(original.messageId ?? null);
      if (id) messageIds.push(id);
      recipients.push(
        ...addressValues(original.to).flatMap(
          (value) => normalizeEmailAddress(value) ?? [],
        ),
      );
    } catch {
      // Explicit header scanning above remains available for truncated reports.
    }
  }

  return {
    messageIds: [...new Set(messageIds)],
    recipients: [...new Set(recipients)],
  };
}

function typedAddress(value: string | null): string | null {
  if (!value) return null;
  const separator = value.indexOf(";");
  const candidate = (separator >= 0 ? value.slice(separator + 1) : value)
    .trim()
    .replace(/^<|>$/g, "");
  return normalizeEmailAddress(candidate);
}

function contentType(mail: ParsedMail): {
  reportType: string | null;
  value: string | null;
} {
  const header = mail.headers.get("content-type");

  if (!header || typeof header === "string" || Array.isArray(header)) {
    return { reportType: null, value: null };
  }

  if (!("value" in header) || !("params" in header)) {
    return { reportType: null, value: null };
  }

  return {
    reportType: header.params["report-type"]?.toLowerCase() ?? null,
    value: header.value.toLowerCase(),
  };
}

function uniqueMessageId(ids: string[]): string {
  const unique = [...new Set(ids)];

  if (unique.length !== 1) {
    throw new FeedbackError("INVALID_REPORT");
  }

  return unique[0];
}

function parseDsn(
  mail: ParsedMail,
  messageIds: string[],
): ParsedFeedbackOutcome[] {
  const deliveryParts = mail.attachments.filter(
    (attachment) => attachment.contentType === "message/delivery-status",
  );
  const blocks = deliveryParts.flatMap((part) => parseHeaderBlocks(part.content));
  const ids = [
    ...messageIds,
    ...blocks.flatMap((block) => uuidFrom(firstField(block, "original-envelope-id")) ?? []),
  ];
  const messageId = uniqueMessageId(ids);
  const outcomes: ParsedFeedbackOutcome[] = [];

  for (const block of blocks) {
    const action = firstField(block, "action")?.toLowerCase() ?? null;
    const status = firstField(block, "status")?.trim() ?? null;
    const recipient =
      typedAddress(firstField(block, "final-recipient")) ??
      typedAddress(firstField(block, "original-recipient"));

    if (!recipient || !status || !/^[45]\.[0-9]{1,3}\.[0-9]{1,3}$/.test(status)) {
      continue;
    }

    if (action !== "failed" && action !== "delayed") {
      continue;
    }

    outcomes.push({
      classification: status.startsWith("5.") ? "hard_bounce" : "soft_bounce",
      messageId,
      recipient,
      status,
    });
  }

  return outcomes;
}

function parseArf(
  mail: ParsedMail,
  messageIds: string[],
  originalRecipients: string[],
): ParsedFeedbackOutcome[] {
  const feedbackParts = mail.attachments.filter(
    (attachment) => attachment.contentType === "message/feedback-report",
  );
  const blocks = feedbackParts.flatMap((part) => parseHeaderBlocks(part.content));
  const feedbackTypes = blocks.flatMap(
    (block) => firstField(block, "feedback-type")?.toLowerCase() ?? [],
  );

  if (
    feedbackTypes.length === 0 ||
    feedbackTypes.some((value) => !["abuse", "fraud", "other", "virus"].includes(value))
  ) {
    return [];
  }

  const ids = [
    ...messageIds,
    ...blocks.flatMap((block) => uuidFrom(firstField(block, "original-envelope-id")) ?? []),
  ];
  const messageId = uniqueMessageId(ids);
  const reportedRecipients = blocks.flatMap((block) =>
    (block.get("original-rcpt-to") ?? []).flatMap(
      (value) => typedAddress(value) ?? [],
    ),
  );
  const explicitRecipients = [...new Set(reportedRecipients)];
  const fallbackRecipients = [...new Set(originalRecipients)];
  const recipients =
    explicitRecipients.length > 0
      ? explicitRecipients
      : fallbackRecipients.length === 1
        ? fallbackRecipients
        : [];

  return recipients.map((recipient) => ({
    classification: "complaint",
    messageId,
    recipient,
    status: null,
  }));
}

export function decodeFeedbackReportBase64(value: unknown): Buffer {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > MAX_FEEDBACK_REPORT_BASE64_LENGTH ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(value)
  ) {
    throw new FeedbackError(
      typeof value === "string" && value.length > MAX_FEEDBACK_REPORT_BASE64_LENGTH
        ? "REPORT_TOO_LARGE"
        : "INVALID_REPORT",
    );
  }

  const decoded = Buffer.from(value, "base64");

  if (
    decoded.length === 0 ||
    decoded.length > MAX_FEEDBACK_REPORT_BYTES ||
    decoded.toString("base64") !== value
  ) {
    throw new FeedbackError(
      decoded.length > MAX_FEEDBACK_REPORT_BYTES
        ? "REPORT_TOO_LARGE"
        : "INVALID_REPORT",
    );
  }

  return decoded;
}

export async function parseFeedbackReport(
  raw: Buffer,
): Promise<ParsedFeedbackReport> {
  if (raw.length === 0) {
    throw new FeedbackError("INVALID_REPORT");
  }

  if (raw.length > MAX_FEEDBACK_REPORT_BYTES) {
    throw new FeedbackError("REPORT_TOO_LARGE");
  }

  let mail: ParsedMail;

  try {
    mail = await simpleParser(raw, {
      keepDeliveryStatus: true,
      maxHtmlLengthToParse: MAX_FEEDBACK_REPORT_BYTES,
      skipHtmlToText: true,
      skipImageLinks: true,
      skipTextLinks: true,
      skipTextToHtml: true,
    } as SimpleParserOptions & { keepDeliveryStatus: boolean });
  } catch {
    throw new FeedbackError("INVALID_REPORT");
  }

  const type = contentType(mail);

  if (type.value !== "multipart/report") {
    throw new FeedbackError("INVALID_REPORT");
  }

  const original = await originalMessageMetadata(mail);
  let outcomes: ParsedFeedbackOutcome[];

  if (type.reportType === "delivery-status") {
    outcomes = parseDsn(mail, original.messageIds);
  } else if (type.reportType === "feedback-report") {
    outcomes = parseArf(mail, original.messageIds, original.recipients);
  } else {
    throw new FeedbackError("INVALID_REPORT");
  }

  outcomes = outcomes.filter(
    (outcome, index, all) =>
      index ===
      all.findIndex(
        (candidate) =>
          candidate.classification === outcome.classification &&
          candidate.messageId === outcome.messageId &&
          candidate.recipient === outcome.recipient,
      ),
  );

  if (outcomes.length === 0 || outcomes.length > 50) {
    throw new FeedbackError("INVALID_REPORT");
  }

  return {
    outcomes,
    reportSha256: createHash("sha256").update(raw).digest("hex"),
  };
}
