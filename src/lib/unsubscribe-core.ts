import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_PREFIX = "pbunsub_v1";
const TOKEN_CONTEXT = "paperboy:unsubscribe:v1";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class UnsubscribeConfigurationError extends Error {
  constructor() {
    super("PaperBoy unsubscribe signing is unavailable.");
    this.name = "UnsubscribeConfigurationError";
  }
}

export function parseUnsubscribeSigningKey(
  raw = process.env.PAPERBOY_UNSUBSCRIBE_SIGNING_KEY,
): Buffer {
  if (!raw) throw new UnsubscribeConfigurationError();
  const key = Buffer.from(raw, "base64");
  if (
    key.length !== 32 ||
    (key.toString("base64") !== raw && key.toString("base64url") !== raw)
  ) {
    throw new UnsubscribeConfigurationError();
  }
  return key;
}

function signature(payload: string, key: Buffer): Buffer {
  return createHmac("sha256", key)
    .update(`${TOKEN_CONTEXT}.${payload}`, "utf8")
    .digest();
}

export function createUnsubscribeToken(input: {
  contactId: string;
  key?: Buffer;
}): string {
  if (!UUID_PATTERN.test(input.contactId)) {
    throw new TypeError("A valid contact UUID is required.");
  }
  const payload = Buffer.from(
    JSON.stringify({ contact_id: input.contactId, v: 1 }),
    "utf8",
  ).toString("base64url");
  return `${TOKEN_PREFIX}.${payload}.${signature(
    payload,
    input.key ?? parseUnsubscribeSigningKey(),
  ).toString("base64url")}`;
}

export function verifyUnsubscribeToken(input: {
  key?: Buffer;
  token: string;
}): string | null {
  if (input.token.length > 512) return null;
  const [prefix, payload, encodedSignature, extra] = input.token.split(".");
  if (prefix !== TOKEN_PREFIX || !payload || !encodedSignature || extra) return null;

  let actual: Buffer;
  try {
    actual = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  if (actual.toString("base64url") !== encodedSignature) return null;
  const expected = signature(payload, input.key ?? parseUnsubscribeSigningKey());
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return decoded?.v === 1 && UUID_PATTERN.test(decoded.contact_id)
      ? decoded.contact_id
      : null;
  } catch {
    return null;
  }
}

export function createUnsubscribeUrl(input: {
  baseUrl?: string;
  contactId: string;
  key?: Buffer;
}): string {
  const baseUrl =
    input.baseUrl ?? process.env.PAPERBOY_PUBLIC_URL ?? process.env.BETTER_AUTH_URL;
  if (!baseUrl) throw new UnsubscribeConfigurationError();
  let url: URL;
  try {
    url = new URL("/unsubscribe", baseUrl);
  } catch {
    throw new UnsubscribeConfigurationError();
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password
  ) {
    throw new UnsubscribeConfigurationError();
  }
  url.searchParams.set(
    "token",
    createUnsubscribeToken({ contactId: input.contactId, key: input.key }),
  );
  return url.toString();
}

export function withUnsubscribeFooter(input: {
  html: string | null;
  text: string | null;
}): { html: string | null; text: string | null } {
  const token = "{{unsubscribe_url}}";
  return {
    html:
      input.html && !input.html.includes(token)
        ? `${input.html}\n<p><a href="${token}">Unsubscribe</a></p>`
        : input.html,
    text:
      input.text && !input.text.includes(token)
        ? `${input.text}\n\nUnsubscribe: ${token}`
        : input.text,
  };
}
