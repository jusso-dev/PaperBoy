import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { parseEmailAddressField } from "@/lib/email-core";
import type { MessageEventType } from "@/lib/message-event-core";

function webhookAddress(value: string): string {
  return parseEmailAddressField(value)?.address ?? value;
}

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_AAD_PREFIX = "paperboy:webhook-secret:v1";

export const WEBHOOK_DELIVERY_STATUSES = [
  "queued",
  "sending",
  "delivered",
  "failed",
] as const;
export const WEBHOOK_SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
export const WEBHOOK_URL_MAX_LENGTH = 2_048;

export type WebhookDeliveryStatus =
  (typeof WEBHOOK_DELIVERY_STATUSES)[number];

export type WebhookErrorCode =
  | "CONFIGURATION_INVALID"
  | "INVALID_INPUT"
  | "INVALID_URL"
  | "MEMBERSHIP_REQUIRED"
  | "SECRET_UNAVAILABLE";

export class WebhookError extends Error {
  constructor(readonly code: WebhookErrorCode) {
    super(code);
    this.name = "WebhookError";
  }
}

type WebhookSecretContext = {
  endpointId: string;
  orgId: string;
};

function encryptionAad(context: WebhookSecretContext): Buffer {
  return Buffer.from(
    `${ENCRYPTION_AAD_PREFIX}:${context.orgId}:${context.endpointId}`,
    "utf8",
  );
}

function decodeSigningSecret(secret: string): Buffer {
  if (!secret.startsWith("whsec_")) {
    throw new WebhookError("SECRET_UNAVAILABLE");
  }

  const encoded = secret.slice("whsec_".length);

  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new WebhookError("SECRET_UNAVAILABLE");
  }

  const decoded = Buffer.from(encoded, "base64");

  if (decoded.length < 16 || decoded.length > 64) {
    throw new WebhookError("SECRET_UNAVAILABLE");
  }

  return decoded;
}

export function createWebhookSigningSecret(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

export function parseWebhookEncryptionKey(value: unknown): Buffer {
  if (typeof value !== "string") {
    throw new WebhookError("CONFIGURATION_INVALID");
  }

  const encoded = value.trim();

  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) {
    throw new WebhookError("CONFIGURATION_INVALID");
  }

  const key = Buffer.from(encoded, "base64");

  if (key.length !== 32) {
    throw new WebhookError("CONFIGURATION_INVALID");
  }

  return key;
}

export function configuredWebhookEncryptionKey(): Buffer {
  return parseWebhookEncryptionKey(
    process.env.PAPERBOY_WEBHOOK_ENCRYPTION_KEY,
  );
}

export function encryptWebhookSigningSecret(input: {
  context: WebhookSecretContext;
  encryptionKey: Buffer;
  secret: string;
}): string {
  decodeSigningSecret(input.secret);

  if (input.encryptionKey.length !== 32) {
    throw new WebhookError("CONFIGURATION_INVALID");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    ENCRYPTION_ALGORITHM,
    input.encryptionKey,
    iv,
  );
  cipher.setAAD(encryptionAad(input.context));
  const ciphertext = Buffer.concat([
    cipher.update(input.secret, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptWebhookSigningSecret(input: {
  context: WebhookSecretContext;
  encryptedSecret: string;
  encryptionKey: Buffer;
}): string {
  if (input.encryptionKey.length !== 32) {
    throw new WebhookError("CONFIGURATION_INVALID");
  }

  const parts = input.encryptedSecret.split(".");
  const [version, encodedIv, encodedTag, encodedCiphertext] = parts;

  if (
    parts.length !== 4 ||
    version !== ENCRYPTION_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext
  ) {
    throw new WebhookError("SECRET_UNAVAILABLE");
  }

  try {
    const iv = Buffer.from(encodedIv, "base64url");
    const tag = Buffer.from(encodedTag, "base64url");
    const ciphertext = Buffer.from(encodedCiphertext, "base64url");

    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
      throw new Error("Invalid envelope");
    }

    const decipher = createDecipheriv(
      ENCRYPTION_ALGORITHM,
      input.encryptionKey,
      iv,
    );
    decipher.setAAD(encryptionAad(input.context));
    decipher.setAuthTag(tag);
    const secret = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
    decodeSigningSecret(secret);
    return secret;
  } catch {
    throw new WebhookError("SECRET_UNAVAILABLE");
  }
}

export function parseWebhookUrl(
  value: unknown,
  options: { allowInsecureLoopback?: boolean } = {},
): string {
  if (typeof value !== "string") {
    throw new WebhookError("INVALID_URL");
  }

  const raw = value.trim();

  if (!raw || raw.length > WEBHOOK_URL_MAX_LENGTH) {
    throw new WebhookError("INVALID_URL");
  }

  let url: URL;

  try {
    url = new URL(raw);
  } catch {
    throw new WebhookError("INVALID_URL");
  }

  const hostname = url.hostname.toLowerCase();
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
  const insecureLoopback =
    url.protocol === "http:" &&
    loopback &&
    options.allowInsecureLoopback === true;

  if (
    (url.protocol !== "https:" && !insecureLoopback) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new WebhookError("INVALID_URL");
  }

  return url.toString();
}

export function parseWebhookConfigurationInput(
  value: unknown,
  options?: { allowInsecureLoopback?: boolean },
): { url: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new WebhookError("INVALID_INPUT");
  }

  const input = value as Record<string, unknown>;

  if (Object.keys(input).some((key) => key !== "url")) {
    throw new WebhookError("INVALID_INPUT");
  }

  return { url: parseWebhookUrl(input.url, options) };
}

export function webhookEventBody(input: {
  createdAt: Date;
  environment: "live" | "test";
  messageId: string;
  type: MessageEventType;
}): string {
  return JSON.stringify({
    created_at: input.createdAt.toISOString(),
    data: {
      email_id: input.messageId,
      environment: input.environment,
    },
    type: `email.${input.type}`,
  });
}

export function receivedEmailWebhookBody(input: {
  createdAt: Date;
  environment: "live" | "test";
  from: string;
  messageId: string | null;
  receivedEmailId: string;
  subject: string;
  to: string[];
}): string {
  return JSON.stringify({
    created_at: input.createdAt.toISOString(),
    data: {
      email_id: input.receivedEmailId,
      environment: input.environment,
      from: webhookAddress(input.from),
      message_id: input.messageId,
      subject: input.subject,
      to: input.to.map(webhookAddress),
    },
    type: "email.received",
  });
}

export function signWebhook(input: {
  body: string;
  id: string;
  secret: string;
  timestamp: number;
}): string {
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp < 0) {
    throw new WebhookError("INVALID_INPUT");
  }

  const signature = createHmac("sha256", decodeSigningSecret(input.secret))
    .update(`${input.id}.${input.timestamp}.${input.body}`, "utf8")
    .digest("base64");
  return `v1,${signature}`;
}

type WebhookHeaders = Headers | Record<string, string | undefined>;

function headerValue(headers: WebhookHeaders, name: string): string | null {
  if (headers instanceof Headers) {
    return headers.get(name);
  }

  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  );
  return entry?.[1] ?? null;
}

export function verifyWebhookSignature(input: {
  body: string;
  headers: WebhookHeaders;
  now?: Date;
  secret: string;
  toleranceSeconds?: number;
}): boolean {
  try {
    const id = headerValue(input.headers, "webhook-id");
    const timestampText = headerValue(input.headers, "webhook-timestamp");
    const signatures = headerValue(input.headers, "webhook-signature");

    if (!id || !timestampText || !signatures || !/^\d{1,12}$/.test(timestampText)) {
      return false;
    }

    const timestamp = Number(timestampText);
    const tolerance =
      input.toleranceSeconds ?? WEBHOOK_SIGNATURE_TOLERANCE_SECONDS;
    const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);

    if (
      !Number.isSafeInteger(timestamp) ||
      !Number.isFinite(tolerance) ||
      tolerance < 0 ||
      Math.abs(nowSeconds - timestamp) > tolerance
    ) {
      return false;
    }

    const expected = Buffer.from(
      signWebhook({ body: input.body, id, secret: input.secret, timestamp }).slice(
        "v1,".length,
      ),
      "base64",
    );

    return signatures.split(/\s+/).some((candidate) => {
      const [version, encoded, extra] = candidate.split(",");

      if (version !== "v1" || !encoded || extra !== undefined) {
        return false;
      }

      const actual = Buffer.from(encoded, "base64");
      return actual.length === expected.length && timingSafeEqual(actual, expected);
    });
  } catch {
    return false;
  }
}
