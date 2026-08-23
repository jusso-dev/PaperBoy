import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  open,
  readFile,
  unlink,
} from "node:fs/promises";
import { dirname, isAbsolute, parse, resolve, sep } from "node:path";

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
