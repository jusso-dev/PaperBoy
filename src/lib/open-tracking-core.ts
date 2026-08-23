import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_CONTEXT = "paperboy:open-tracking:v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OpenTrackingSettings = {
  enabled: boolean;
  updatedAt: Date;
};

export type OpenTrackingValidationIssue = {
  field: string;
  message: string;
};

export class OpenTrackingConfigurationError extends Error {
  constructor() {
    super("PaperBoy open tracking is unavailable.");
    this.name = "OpenTrackingConfigurationError";
  }
}

export class OpenTrackingSettingsError extends Error {
  constructor(
    readonly code: "MEMBERSHIP_REQUIRED" | "VALIDATION_ERROR",
    readonly issues: OpenTrackingValidationIssue[] = [],
  ) {
    super(code);
    this.name = "OpenTrackingSettingsError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseUpdateOpenTrackingInput(value: unknown): {
  enabled: boolean;
} {
  if (!isRecord(value)) {
    throw new OpenTrackingSettingsError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues = Object.keys(value)
    .filter((field) => field !== "enabled")
    .map((field) => ({ field, message: "This field is not supported." }));
  if (!Object.hasOwn(value, "enabled")) {
    issues.push({ field: "enabled", message: "Choose true or false." });
  } else if (typeof value.enabled !== "boolean") {
    issues.push({ field: "enabled", message: "Must be true or false." });
  }
  if (issues.length > 0) {
    throw new OpenTrackingSettingsError("VALIDATION_ERROR", issues);
  }
  return { enabled: value.enabled as boolean };
}

export function parseOpenTrackingSigningKey(
  raw = process.env.PAPERBOY_OPEN_TRACKING_SIGNING_KEY,
): Buffer {
  if (!raw) throw new OpenTrackingConfigurationError();
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw) {
    throw new OpenTrackingConfigurationError();
  }
  return key;
}

export function openTrackingPublicUrl(
  raw = process.env.PAPERBOY_PUBLIC_URL ?? process.env.BETTER_AUTH_URL,
): URL {
  if (!raw) throw new OpenTrackingConfigurationError();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new OpenTrackingConfigurationError();
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    url.hostname.toLowerCase(),
  );
  const insecureLoopback =
    url.protocol === "http:" &&
    loopback &&
    process.env.NODE_ENV !== "production";
  if (
    (url.protocol !== "https:" && !insecureLoopback) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new OpenTrackingConfigurationError();
  }
  return url;
}

function requireMessageId(messageId: string): void {
  if (!UUID_PATTERN.test(messageId)) {
    throw new TypeError("A valid message UUID is required.");
  }
}

function signature(messageId: string, key: Buffer): Buffer {
  return createHmac("sha256", key)
    .update(`${SIGNATURE_CONTEXT}.${messageId}`, "utf8")
    .digest();
}

export function createOpenTrackingSignature(input: {
  key?: Buffer;
  messageId: string;
}): string {
  requireMessageId(input.messageId);
  return signature(
    input.messageId,
    input.key ?? parseOpenTrackingSigningKey(),
  ).toString("base64url");
}

export function verifyOpenTrackingSignature(input: {
  key?: Buffer;
  messageId: string;
  signature: string;
}): boolean {
  if (!UUID_PATTERN.test(input.messageId) || input.signature.length > 128) {
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
    input.key ?? parseOpenTrackingSigningKey(),
  );
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createOpenTrackingUrl(input: {
  baseUrl?: string;
  key?: Buffer;
  messageId: string;
}): string {
  const baseUrl = openTrackingPublicUrl(input.baseUrl);
  const pixel = new URL(
    `/o/${input.messageId}/${createOpenTrackingSignature(input)}.gif`,
    baseUrl,
  );
  return pixel.toString();
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function appendOpenTrackingPixel(input: {
  html: string;
  url: string;
}): string {
  const pixel = `<img src="${escapeHtmlAttribute(input.url)}" alt="" width="1" height="1" aria-hidden="true" style="display:none!important;width:1px;height:1px;border:0" />`;
  const bodyClose = /<\/body\s*>/i.exec(input.html);
  if (!bodyClose || bodyClose.index === undefined) {
    return `${input.html}\n${pixel}`;
  }
  return `${input.html.slice(0, bodyClose.index)}${pixel}\n${input.html.slice(bodyClose.index)}`;
}
