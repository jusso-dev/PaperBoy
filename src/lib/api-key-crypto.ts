import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_ENVIRONMENTS = ["live", "test"] as const;

export type ApiKeyEnvironment = (typeof API_KEY_ENVIRONMENTS)[number];

const keyPattern =
  /^pb_(live|test)_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/;

export type ParsedApiKey = {
  environment: ApiKeyEnvironment;
  keyId: string;
};

export function isApiKeyEnvironment(
  value: unknown,
): value is ApiKeyEnvironment {
  return (
    typeof value === "string" &&
    API_KEY_ENVIRONMENTS.includes(value as ApiKeyEnvironment)
  );
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

export function verifyApiKeyHash(rawKey: string, storedHash: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(storedHash)) {
    return false;
  }

  const candidate = Buffer.from(hashApiKey(rawKey), "hex");
  const stored = Buffer.from(storedHash, "hex");

  return timingSafeEqual(candidate, stored);
}

export function parseApiKey(rawKey: unknown): ParsedApiKey | null {
  if (typeof rawKey !== "string") {
    return null;
  }

  const match = keyPattern.exec(rawKey);

  if (!match) {
    return null;
  }

  const environment = match[1];
  const keyId = match[2];

  if (!isApiKeyEnvironment(environment) || !keyId) {
    return null;
  }

  return { environment, keyId };
}

export function formatApiKeyDisplay(
  environment: ApiKeyEnvironment,
  keyId: string,
): string {
  return `pb_${environment}_${keyId}_••••••••`;
}

export function generateApiKey(environment: ApiKeyEnvironment) {
  const keyId = randomBytes(12).toString("base64url");
  const secret = randomBytes(32).toString("base64url");
  const rawKey = `pb_${environment}_${keyId}_${secret}`;

  return {
    display: formatApiKeyDisplay(environment, keyId),
    keyHash: hashApiKey(rawKey),
    keyId,
    rawKey,
  };
}
