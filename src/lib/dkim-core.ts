import {
  createCipheriv,
  createDecipheriv,
  generateKeyPair,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { dkimSign } from "mailauth/lib/dkim/sign.js";

const ENCRYPTION_VERSION = "v1";
const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const ENCRYPTION_AAD_PREFIX = "paperboy:dkim-private-key:v1";
const PAPERBOY_SIGNED_HEADERS = ["from", "subject", "date"] as const;

export const DKIM_KEY_STATUSES = [
  "pending",
  "active",
  "retiring",
  "retired",
] as const;

export type DkimKeyStatus = (typeof DKIM_KEY_STATUSES)[number];

export type DkimErrorCode =
  | "CONFIGURATION_INVALID"
  | "KEY_NOT_ACTIVE"
  | "PRIVATE_KEY_UNAVAILABLE"
  | "RAW_MESSAGE_INVALID"
  | "ROTATION_NOT_READY"
  | "ROTATION_PENDING"
  | "SIGNING_FAILED";

export class DkimError extends Error {
  constructor(readonly code: DkimErrorCode) {
    super(code);
    this.name = "DkimError";
  }
}

export type PreparedDkimKey = {
  encryptedPrivateKey: string;
  id: string;
  publicKey: string;
  selector: string;
};

type EncryptionContext = {
  domainId: string;
  keyId: string;
};

function encryptionAad(context: EncryptionContext): Buffer {
  return Buffer.from(
    `${ENCRYPTION_AAD_PREFIX}:${context.domainId}:${context.keyId}`,
    "utf8",
  );
}

export function parseDkimEncryptionKey(value: unknown): Buffer {
  if (typeof value !== "string") {
    throw new DkimError("CONFIGURATION_INVALID");
  }

  const encoded = value.trim();

  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(encoded)) {
    throw new DkimError("CONFIGURATION_INVALID");
  }

  const key = Buffer.from(encoded, "base64");

  if (key.length !== 32) {
    throw new DkimError("CONFIGURATION_INVALID");
  }

  return key;
}

export function configuredDkimEncryptionKey(): Buffer {
  return parseDkimEncryptionKey(process.env.PAPERBOY_DKIM_ENCRYPTION_KEY);
}

export function encryptDkimPrivateKey(input: {
  context: EncryptionContext;
  encryptionKey: Buffer;
  privateKey: string;
}): string {
  if (input.encryptionKey.length !== 32) {
    throw new DkimError("CONFIGURATION_INVALID");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(
    ENCRYPTION_ALGORITHM,
    input.encryptionKey,
    iv,
  );
  cipher.setAAD(encryptionAad(input.context));
  const ciphertext = Buffer.concat([
    cipher.update(input.privateKey, "utf8"),
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

export function decryptDkimPrivateKey(input: {
  context: EncryptionContext;
  encryptedPrivateKey: string;
  encryptionKey: Buffer;
}): string {
  if (input.encryptionKey.length !== 32) {
    throw new DkimError("CONFIGURATION_INVALID");
  }

  const parts = input.encryptedPrivateKey.split(".");
  const [version, encodedIv, encodedTag, encodedCiphertext] = parts;

  if (
    parts.length !== 4 ||
    version !== ENCRYPTION_VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext
  ) {
    throw new DkimError("PRIVATE_KEY_UNAVAILABLE");
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

    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new DkimError("PRIVATE_KEY_UNAVAILABLE");
  }
}

export function createDkimSelector(
  now: Date = new Date(),
  suffix: string = randomBytes(4).toString("hex"),
): string {
  const date = now.toISOString().slice(0, 10).replaceAll("-", "");
  const normalizedSuffix = suffix.toLowerCase().replace(/[^a-z0-9]/g, "");

  if (!normalizedSuffix || normalizedSuffix.length > 32) {
    throw new DkimError("CONFIGURATION_INVALID");
  }

  return `pb${date}${normalizedSuffix}`;
}

export function dkimDnsName(domain: string, selector: string): string {
  return `${selector}._domainkey.${domain}`;
}

export function dkimDnsValue(publicKey: string): string {
  return `v=DKIM1; k=rsa; p=${publicKey}`;
}

export function isDkimKeyStatus(value: unknown): value is DkimKeyStatus {
  return (
    typeof value === "string" &&
    DKIM_KEY_STATUSES.includes(value as DkimKeyStatus)
  );
}

function generateRsaKeyPair(): Promise<{
  privateKey: string;
  publicKey: Buffer;
}> {
  return new Promise((resolve, reject) => {
    generateKeyPair(
      "rsa",
      {
        modulusLength: 2048,
        privateKeyEncoding: { format: "pem", type: "pkcs8" },
        publicKeyEncoding: { format: "der", type: "spki" },
      },
      (error, publicKey, privateKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve({ privateKey, publicKey });
      },
    );
  });
}

export async function prepareEncryptedDkimKey(input: {
  domainId: string;
  encryptionKey?: Buffer;
  keyId?: string;
  now?: Date;
  selector?: string;
}): Promise<PreparedDkimKey> {
  const id = input.keyId ?? randomUUID();
  const selector =
    input.selector ?? createDkimSelector(input.now ?? new Date());

  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(selector)) {
    throw new DkimError("CONFIGURATION_INVALID");
  }
  const encryptionKey =
    input.encryptionKey ?? configuredDkimEncryptionKey();
  const { privateKey, publicKey } = await generateRsaKeyPair();
  const encryptedPrivateKey = encryptDkimPrivateKey({
    context: { domainId: input.domainId, keyId: id },
    encryptionKey,
    privateKey,
  });

  return {
    encryptedPrivateKey,
    id,
    publicKey: publicKey.toString("base64"),
    selector,
  };
}

function rawHeaderBlock(rawMessage: Buffer): string {
  const crlfBoundary = rawMessage.indexOf("\r\n\r\n");
  const lfBoundary = rawMessage.indexOf("\n\n");
  const boundary =
    crlfBoundary < 0
      ? lfBoundary
      : lfBoundary < 0
        ? crlfBoundary
        : Math.min(crlfBoundary, lfBoundary);

  if (boundary < 0 || boundary > 64 * 1024) {
    throw new DkimError("RAW_MESSAGE_INVALID");
  }

  return rawMessage.subarray(0, boundary).toString("latin1");
}

function rawHeaderNames(rawMessage: Buffer): string[] {
  const names: string[] = [];

  for (const line of rawHeaderBlock(rawMessage).split(/\r?\n/)) {
    if (/^[ \t]/.test(line)) {
      continue;
    }

    const separator = line.indexOf(":");

    if (separator <= 0) {
      throw new DkimError("RAW_MESSAGE_INVALID");
    }

    names.push(line.slice(0, separator).trim().toLowerCase());
  }

  return names;
}

function assertPaperBoySignableMessage(rawMessage: Buffer): void {
  const names = rawHeaderNames(rawMessage);

  if (
    PAPERBOY_SIGNED_HEADERS.some(
      (required) => names.filter((name) => name === required).length !== 1,
    )
  ) {
    throw new DkimError("RAW_MESSAGE_INVALID");
  }
}

export function prepareCloudflareManagedMessage(
  rawMessage: Buffer | string,
): Buffer {
  const raw = Buffer.isBuffer(rawMessage)
    ? Buffer.from(rawMessage)
    : Buffer.from(rawMessage, "utf8");

  const headerNames = rawHeaderNames(raw);

  if (
    headerNames.includes("date") ||
    headerNames.includes("dkim-signature")
  ) {
    throw new DkimError("RAW_MESSAGE_INVALID");
  }

  return raw;
}

export async function signRawEmail(input: {
  domain: string;
  now?: Date;
  privateKey: string;
  rawMessage: Buffer | string;
  selector: string;
}): Promise<Buffer> {
  const rawMessage = Buffer.isBuffer(input.rawMessage)
    ? Buffer.from(input.rawMessage)
    : Buffer.from(input.rawMessage, "utf8");
  assertPaperBoySignableMessage(rawMessage);

  const signatureData = {
    algorithm: "rsa-sha256",
    canonicalization: "relaxed/relaxed",
    privateKey: input.privateKey,
    selector: input.selector,
    signingDomain: input.domain,
  };
  let result: Awaited<ReturnType<typeof dkimSign>>;

  try {
    result = await dkimSign(rawMessage, {
      ...signatureData,
      // mailauth 5 accepts a colon-separated runtime value despite its array type.
      headerList: PAPERBOY_SIGNED_HEADERS.join(":") as unknown as string[],
      signTime: input.now ?? new Date(),
      signatureData: [signatureData],
    });
  } catch {
    throw new DkimError("SIGNING_FAILED");
  }

  if (result.errors.length > 0 || !result.signatures) {
    throw new DkimError("SIGNING_FAILED");
  }

  return Buffer.concat([
    Buffer.from(result.signatures, "utf8"),
    rawMessage,
  ]);
}
