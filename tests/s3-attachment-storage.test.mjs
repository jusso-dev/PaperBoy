import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  AttachmentStorageError,
  attachmentStorageKey,
  createConfiguredAttachmentStore,
  createS3AttachmentStore,
} from "../src/lib/attachment-storage.ts";

const storageKey = attachmentStorageKey({
  attachmentId: "33333333-3333-4333-8333-333333333333",
  messageId: "22222222-2222-4222-8222-222222222222",
  orgId: "11111111-1111-4111-8111-111111111111",
});

function fakeS3() {
  const calls = [];
  const objects = new Map();

  return {
    calls,
    client: {
      async send(command) {
        calls.push(command);
        const { Bucket, Key } = command.input;

        if (command.constructor.name === "PutObjectCommand") {
          if (objects.has(`${Bucket}/${Key}`)) throw new Error("PreconditionFailed");
          objects.set(`${Bucket}/${Key}`, Buffer.from(command.input.Body));
          return {};
        }

        if (command.constructor.name === "GetObjectCommand") {
          const value = objects.get(`${Bucket}/${Key}`);
          if (!value) throw new Error("NoSuchKey");
          return {
            Body: {
              async transformToByteArray() {
                return new Uint8Array(value);
              },
            },
          };
        }

        if (command.constructor.name === "DeleteObjectCommand") {
          objects.delete(`${Bucket}/${Key}`);
          return {};
        }

        throw new Error("Unexpected command");
      },
    },
  };
}

test("private S3 attachment storage uses bounded encrypted objects and no ACL", async () => {
  const s3 = fakeS3();
  const store = createS3AttachmentStore({
    bucket: "paperboy-private-attachments",
    client: s3.client,
    prefix: "attachments",
    region: "ap-southeast-2",
  });
  const content = Buffer.from("private attachment");

  await store.put({ content, storageKey });
  const put = s3.calls[0].input;
  assert.equal(
    put.Key,
    `attachments/${storageKey}`,
  );
  assert.equal(put.ACL, undefined);
  assert.equal(put.CacheControl, "no-store");
  assert.equal(put.ContentLength, content.length);
  assert.equal(put.IfNoneMatch, "*");
  assert.equal(put.ServerSideEncryption, "AES256");
  assert.equal(
    put.ChecksumSHA256,
    createHash("sha256").update(content).digest("base64"),
  );

  assert.deepEqual(await store.read(storageKey), content);
  assert.equal(s3.calls[1].input.Range, "bytes=0-10485760");
  await assert.rejects(
    store.put({ content, storageKey }),
    (error) =>
      error instanceof AttachmentStorageError && error.code === "WRITE_FAILED",
  );

  await store.delete(storageKey);
  await assert.rejects(
    store.read(storageKey),
    (error) =>
      error instanceof AttachmentStorageError && error.code === "READ_FAILED",
  );
});

test("attachment storage driver fails closed for invalid S3 configuration", () => {
  assert.throws(
    () =>
      createConfiguredAttachmentStore({
        PAPERBOY_ATTACHMENT_STORAGE_DRIVER: "s3",
        PAPERBOY_ATTACHMENT_S3_BUCKET: "Not A Bucket",
        PAPERBOY_ATTACHMENT_S3_REGION: "ap-southeast-2",
      }),
    (error) =>
      error instanceof AttachmentStorageError &&
      error.code === "CONFIGURATION_INVALID",
  );
  assert.throws(
    () =>
      createConfiguredAttachmentStore({
        PAPERBOY_ATTACHMENT_STORAGE_DRIVER: "unknown",
      }),
    (error) =>
      error instanceof AttachmentStorageError &&
      error.code === "CONFIGURATION_INVALID",
  );
});
