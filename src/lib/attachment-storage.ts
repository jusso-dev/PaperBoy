import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve, sep } from "node:path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type DeleteObjectCommandOutput,
  type GetObjectCommandOutput,
  type PutObjectCommandOutput,
} from "@aws-sdk/client-s3";

export type AttachmentStore = {
  delete: (storageKey: string) => Promise<void>;
  put: (input: { content: Buffer; storageKey: string }) => Promise<void>;
  read: (storageKey: string) => Promise<Buffer>;
};

export type AttachmentStorageErrorCode =
  | "CONFIGURATION_INVALID"
  | "DELETE_FAILED"
  | "INTEGRITY_FAILED"
  | "READ_FAILED"
  | "WRITE_FAILED";

export class AttachmentStorageError extends Error {
  constructor(readonly code: AttachmentStorageErrorCode) {
    super(code);
    this.name = "AttachmentStorageError";
  }
}

const UUID_SOURCE =
  "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const UUID_PATTERN = new RegExp(`^${UUID_SOURCE}$`, "i");
const STORAGE_KEY_PATTERN = new RegExp(
  `^${UUID_SOURCE}/${UUID_SOURCE}/${UUID_SOURCE}\\.blob$`,
  "i",
);
const S3_BUCKET_PATTERN =
  /^(?!\d{1,3}(?:\.\d{1,3}){3}$)(?!.*\.\.)(?!.*(?:\.-|-\.))[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/;
const S3_PREFIX_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,127}$/;
const S3_REGION_PATTERN = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const MAX_STORED_ATTACHMENT_BYTES = 10 * 1024 * 1024;

type S3AttachmentCommand =
  | DeleteObjectCommand
  | GetObjectCommand
  | PutObjectCommand;

type S3AttachmentClient = {
  send: (
    command: S3AttachmentCommand,
  ) => Promise<
    | DeleteObjectCommandOutput
    | GetObjectCommandOutput
    | PutObjectCommandOutput
  >;
};

type S3AttachmentStoreOptions = {
  bucket?: string;
  client?: S3AttachmentClient;
  prefix?: string;
  region?: string;
};

function storageRoot(configuredRoot?: string): string {
  const configured =
    configuredRoot ?? process.env.PAPERBOY_ATTACHMENT_STORAGE_PATH;
  const root = configured?.trim();

  if (
    !root ||
    !isAbsolute(root) ||
    resolve(root) === parse(resolve(root)).root
  ) {
    throw new AttachmentStorageError("CONFIGURATION_INVALID");
  }

  return resolve(root);
}

function storedPath(root: string, storageKey: string): string {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new AttachmentStorageError("INTEGRITY_FAILED");
  }

  const path = resolve(root, storageKey);

  if (!path.startsWith(`${root}${sep}`)) {
    throw new AttachmentStorageError("INTEGRITY_FAILED");
  }

  return path;
}

function requiredS3Value(
  value: string | undefined,
  pattern: RegExp,
): string {
  const configured = value?.trim();

  if (!configured || !pattern.test(configured)) {
    throw new AttachmentStorageError("CONFIGURATION_INVALID");
  }

  return configured;
}

function s3ObjectKey(prefix: string, storageKey: string): string {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) {
    throw new AttachmentStorageError("INTEGRITY_FAILED");
  }

  return `${prefix.replace(/\/+$/, "")}/${storageKey}`;
}

export function attachmentStorageKey(input: {
  attachmentId: string;
  messageId: string;
  orgId: string;
}): string {
  if (
    !UUID_PATTERN.test(input.attachmentId) ||
    !UUID_PATTERN.test(input.messageId) ||
    !UUID_PATTERN.test(input.orgId)
  ) {
    throw new AttachmentStorageError("INTEGRITY_FAILED");
  }

  return `${input.orgId}/${input.messageId}/${input.attachmentId}.blob`;
}

export function createLocalAttachmentStore(
  configuredRoot?: string,
): AttachmentStore {
  return {
    async delete(storageKey) {
      const root = storageRoot(configuredRoot);
      const path = storedPath(root, storageKey);

      try {
        await unlink(path);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return;
        }

        throw new AttachmentStorageError("DELETE_FAILED");
      }
    },

    async put({ content, storageKey }) {
      const root = storageRoot(configuredRoot);
      const path = storedPath(root, storageKey);
      const parent = dirname(path);
      let handle: Awaited<ReturnType<typeof open>> | null = null;
      let created = false;

      try {
        await mkdir(root, { mode: 0o700, recursive: true });
        await chmod(root, 0o700);
        await mkdir(parent, { mode: 0o700, recursive: true });
        await chmod(parent, 0o700);
        handle = await open(path, "wx", 0o600);
        created = true;
        await handle.writeFile(content);
        await handle.sync();
      } catch {
        if (handle) {
          await handle.close().catch(() => undefined);
          handle = null;
        }

        if (created) {
          await unlink(path).catch(() => undefined);
        }
        throw new AttachmentStorageError("WRITE_FAILED");
      } finally {
        await handle?.close();
      }
    },

    async read(storageKey) {
      const root = storageRoot(configuredRoot);
      const path = storedPath(root, storageKey);

      try {
        return await readFile(path);
      } catch {
        throw new AttachmentStorageError("READ_FAILED");
      }
    },
  };
}

export const localAttachmentStore = createLocalAttachmentStore();

export function createS3AttachmentStore(
  options: S3AttachmentStoreOptions = {},
): AttachmentStore {
  const bucket = requiredS3Value(
    options.bucket ?? process.env.PAPERBOY_ATTACHMENT_S3_BUCKET,
    S3_BUCKET_PATTERN,
  );
  const prefix = requiredS3Value(
    options.prefix ?? process.env.PAPERBOY_ATTACHMENT_S3_PREFIX ?? "attachments",
    S3_PREFIX_PATTERN,
  ).replace(/\/+$/, "");
  const region = requiredS3Value(
    options.region ?? process.env.PAPERBOY_ATTACHMENT_S3_REGION,
    S3_REGION_PATTERN,
  );
  const client = options.client ?? new S3Client({ region });

  return {
    async delete(storageKey) {
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: s3ObjectKey(prefix, storageKey),
          }),
        );
      } catch {
        throw new AttachmentStorageError("DELETE_FAILED");
      }
    },

    async put({ content, storageKey }) {
      if (content.length > MAX_STORED_ATTACHMENT_BYTES) {
        throw new AttachmentStorageError("INTEGRITY_FAILED");
      }

      try {
        await client.send(
          new PutObjectCommand({
            Body: content,
            Bucket: bucket,
            CacheControl: "no-store",
            ChecksumSHA256: createHash("sha256")
              .update(content)
              .digest("base64"),
            ContentLength: content.length,
            ContentType: "application/octet-stream",
            IfNoneMatch: "*",
            Key: s3ObjectKey(prefix, storageKey),
            ServerSideEncryption: "AES256",
          }),
        );
      } catch {
        throw new AttachmentStorageError("WRITE_FAILED");
      }
    },

    async read(storageKey) {
      try {
        const response = (await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: s3ObjectKey(prefix, storageKey),
            Range: `bytes=0-${MAX_STORED_ATTACHMENT_BYTES}`,
          }),
        )) as GetObjectCommandOutput;
        const bytes = await response.Body?.transformToByteArray();

        if (!bytes || bytes.byteLength > MAX_STORED_ATTACHMENT_BYTES) {
          throw new AttachmentStorageError("INTEGRITY_FAILED");
        }

        return Buffer.from(bytes);
      } catch (error) {
        if (error instanceof AttachmentStorageError) throw error;
        throw new AttachmentStorageError("READ_FAILED");
      }
    },
  };
}

export function createConfiguredAttachmentStore(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): AttachmentStore {
  const driver =
    environment.PAPERBOY_ATTACHMENT_STORAGE_DRIVER?.trim() || "local";

  if (driver === "local") {
    return createLocalAttachmentStore(
      environment.PAPERBOY_ATTACHMENT_STORAGE_PATH,
    );
  }

  if (driver === "s3") {
    return createS3AttachmentStore({
      bucket: environment.PAPERBOY_ATTACHMENT_S3_BUCKET,
      prefix: environment.PAPERBOY_ATTACHMENT_S3_PREFIX,
      region: environment.PAPERBOY_ATTACHMENT_S3_REGION,
    });
  }

  throw new AttachmentStorageError("CONFIGURATION_INVALID");
}

export const attachmentStore = createConfiguredAttachmentStore();

export function verifyStoredAttachment(input: {
  content: Buffer;
  contentSha256: string;
  size: number;
}) {
  const digest = createHash("sha256").update(input.content).digest("hex");

  if (input.content.length !== input.size || digest !== input.contentSha256) {
    throw new AttachmentStorageError("INTEGRITY_FAILED");
  }
}
