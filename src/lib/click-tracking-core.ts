import { createHmac, timingSafeEqual } from "node:crypto";
import {
  openTrackingPublicUrl,
  parseOpenTrackingSigningKey,
} from "./open-tracking-core";

const SIGNATURE_CONTEXT = "paperboy:click-tracking:v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ClickTrackingValidationIssue = {
  field: string;
  message: string;
};

export class ClickTrackingError extends Error {
  constructor(
    readonly code: "MEMBERSHIP_REQUIRED" | "VALIDATION_ERROR" | "NOT_FOUND",
    readonly issues: ClickTrackingValidationIssue[] = [],
  ) {
    super(code);
    this.name = "ClickTrackingError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseTrackingSubdomain(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return null;
  const input = value.trim().toLowerCase().replace(/\.$/, "");
  if (input.length === 0 || input.length > 253) return null;
  const labels = input.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return null;
  }
  return input;
}

export function parseUpdateDomainClickTrackingInput(value: unknown): {
  enabled: boolean;
  trackingSubdomain: string | null;
} {
  if (!isRecord(value)) {
    throw new ClickTrackingError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }
  const issues: ClickTrackingValidationIssue[] = [];
  for (const field of Object.keys(value)) {
    if (field !== "enabled" && field !== "tracking_subdomain") {
      issues.push({ field, message: "This field is not supported." });
    }
  }
  if (!Object.hasOwn(value, "enabled")) {
    issues.push({ field: "enabled", message: "Choose true or false." });
  } else if (typeof value.enabled !== "boolean") {
    issues.push({ field: "enabled", message: "Must be true or false." });
  }
  let trackingSubdomain: string | null = null;
  if (
    value.tracking_subdomain !== undefined &&
    value.tracking_subdomain !== null &&
    value.tracking_subdomain !== ""
  ) {
    if (typeof value.tracking_subdomain !== "string") {
      issues.push({
        field: "tracking_subdomain",
        message: "Use a hostname such as click.example.com.",
      });
    } else {
      const parsed = parseTrackingSubdomain(value.tracking_subdomain);
      if (!parsed) {
        issues.push({
          field: "tracking_subdomain",
          message: "Use a hostname such as click.example.com.",
        });
      } else {
        trackingSubdomain = parsed;
      }
    }
  }
  if (issues.length > 0) {
    throw new ClickTrackingError("VALIDATION_ERROR", issues);
  }
  return {
    enabled: value.enabled as boolean,
    trackingSubdomain,
  };
}

function requireMessageId(messageId: string): void {
  if (!UUID_PATTERN.test(messageId)) {
    throw new TypeError("A valid message UUID is required.");
  }
}

function signature(messageId: string, targetUrl: string, key: Buffer): Buffer {
  return createHmac("sha256", key)
    .update(`${SIGNATURE_CONTEXT}.${messageId}.${targetUrl}`, "utf8")
    .digest();
}

export function createClickTrackingSignature(input: {
  key?: Buffer;
  messageId: string;
  targetUrl: string;
}): string {
  requireMessageId(input.messageId);
  return signature(
    input.messageId,
    input.targetUrl,
    input.key ?? parseOpenTrackingSigningKey(),
  ).toString("base64url");
}

export function verifyClickTrackingSignature(input: {
  key?: Buffer;
  messageId: string;
  signature: string;
  targetUrl: string;
}): boolean {
  if (
    !UUID_PATTERN.test(input.messageId) ||
    input.signature.length > 128 ||
    input.targetUrl.length === 0 ||
    input.targetUrl.length > 2048
  ) {
    return false;
  }
  let actual: Buffer;
  try {
    actual = Buffer.from(input.signature, "base64url");
  } catch {
    return false;
  }
  if (actual.toString("base64url") !== input.signature) return false;
  const expected = signature(
    input.messageId,
    input.targetUrl,
    input.key ?? parseOpenTrackingSigningKey(),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createClickTrackingUrl(input: {
  baseUrl?: string;
  key?: Buffer;
  messageId: string;
  targetUrl: string;
}): string {
  const baseUrl = openTrackingPublicUrl(input.baseUrl);
  const sig = createClickTrackingSignature(input);
  const url = new URL(`/c/${input.messageId}/${sig}`, baseUrl);
  url.searchParams.set("u", input.targetUrl);
  return url.toString();
}

export function isTrackableUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function rewriteHtmlLinks(input: {
  html: string;
  rewrite: (targetUrl: string) => string;
}): { html: string; rewritten: number } {
  let rewritten = 0;
  const html = input.html.replaceAll(
    /href\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (match, _quoted: string, doubleQuoted?: string, singleQuoted?: string) => {
      const quote = match.includes('"') ? '"' : "'";
      const target = (doubleQuoted ?? singleQuoted ?? "").trim();
      if (!isTrackableUrl(target)) return match;
      // Never double-wrap an already-signed PaperBoy redirect.
      if (/\/c\/[0-9a-f-]{36}\//i.test(target)) return match;
      rewritten += 1;
      return `href=${quote}${escapeHtmlAttribute(input.rewrite(target))}${quote}`;
    },
  );
  return { html, rewritten };
}

export function rewriteHtmlLinksForMessage(input: {
  baseUrl?: string;
  html: string;
  key?: Buffer;
  messageId: string;
}): { html: string; rewritten: number } {
  return rewriteHtmlLinks({
    html: input.html,
    rewrite: (targetUrl) =>
      createClickTrackingUrl({
        baseUrl: input.baseUrl,
        key: input.key,
        messageId: input.messageId,
        targetUrl,
      }),
  });
}
