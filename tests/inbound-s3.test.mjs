import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://paperboy@127.0.0.1:5433/paperboy";
import {
  InboundS3ConfigError,
  parseInboundS3Config,
  processInboundS3Objects,
  shouldSkipInboundObjectKey,
} from "../src/lib/inbound-s3-core.ts";

const raw = [
  "From: Jane <jane@example.com>",
  "To: reply+abc123@snagspot.app",
  "Subject: Re: My ticket",
  "Message-ID: <orig@example.com>",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "The printer is still jammed.",
  "",
].join("\r\n");

test("inbound S3 config is off until bucket and region are both set", () => {
  assert.equal(parseInboundS3Config({}), null);
  assert.throws(
    () => parseInboundS3Config({ PAPERBOY_INBOUND_S3_BUCKET: "paperboy-inbound" }),
    InboundS3ConfigError,
  );
  assert.deepEqual(
    parseInboundS3Config({
      PAPERBOY_INBOUND_S3_BUCKET: "paperboy-inbound",
      PAPERBOY_INBOUND_S3_REGION: "ap-northeast-1",
    }),
    {
      bucket: "paperboy-inbound",
      prefix: "inbound",
      region: "ap-northeast-1",
    },
  );
});

test("SES setup objects stay in the bucket", () => {
  assert.equal(
    shouldSkipInboundObjectKey("inbound/AMAZON_SES_SETUP_NOTIFICATION"),
    true,
  );
  assert.equal(shouldSkipInboundObjectKey("inbound/abc123"), false);
});

test("inbound S3 poll deletes only objects that process successfully", async () => {
  const deleted = [];
  const result = await processInboundS3Objects({
    deleteObject: async (key) => {
      deleted.push(key);
    },
    getObject: async (key) => {
      if (key.endsWith("bad")) throw new Error("read failed");
      return raw;
    },
    keys: [
      "inbound/AMAZON_SES_SETUP_NOTIFICATION",
      "inbound/ok",
      "inbound/nomatch",
      "inbound/bad",
    ],
    processEmail: async () => true,
  });

  // processEmail always returns true here except getObject throws for bad.
  assert.deepEqual(deleted, ["inbound/ok", "inbound/nomatch"]);
  assert.equal(result.deleted, 2);
  assert.equal(result.skipped, 1);
  assert.equal(result.failed, 1);
});

test("inbound S3 poll deletes returned bounce reports without storing them", async () => {
  const bounce = await readFile(
    new URL("fixtures/feedback/hard-bounce.eml", import.meta.url),
    "utf8",
  );
  const objects = new Map([["inbound/bounce", Buffer.from(bounce)]]);
  const received = [];
  const client = {
    async send(command) {
      const name = command.constructor.name;
      if (name === "ListObjectsV2Command") {
        return {
          Contents: [...objects.keys()].map((Key) => ({ Key })),
          IsTruncated: false,
        };
      }
      if (name === "GetObjectCommand") {
        const value = objects.get(command.input.Key);
        if (!value) throw new Error("NoSuchKey");
        return {
          Body: {
            async transformToByteArray() {
              return new Uint8Array(value);
            },
          },
        };
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(command.input.Key);
        return {};
      }
      throw new Error(name);
    },
  };

  const { processInboundS3Queue } = await import("../src/lib/inbound-s3.ts");
  const result = await processInboundS3Queue({
    client,
    environment: {
      PAPERBOY_INBOUND_S3_BUCKET: "paperboy-inbound",
      PAPERBOY_INBOUND_S3_REGION: "ap-northeast-1",
    },
    receive: async () => {
      received.push("stored");
      throw new Error("sinkholed mail must not be stored");
    },
    resolveOrg: async () => {
      received.push("resolved");
      throw new Error("sinkholed mail must not resolve an organization");
    },
  });

  assert.equal(result.deleted, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(received, []);
  assert.equal(objects.has("inbound/bounce"), false);
});

test("inbound S3 poll leaves unmatched mail in the bucket", async () => {
  const deleted = [];
  const result = await processInboundS3Objects({
    deleteObject: async (key) => {
      deleted.push(key);
    },
    getObject: async () => raw,
    keys: ["inbound/nomatch"],
    processEmail: async () => false,
  });

  assert.deepEqual(deleted, []);
  assert.equal(result.failed, 1);
  assert.equal(result.deleted, 0);
});

test("inbound S3 queue lists the prefix, stores a match, and deletes it", async () => {
  const objects = new Map([
    ["inbound/AMAZON_SES_SETUP_NOTIFICATION", Buffer.from("setup")],
    ["inbound/ok", Buffer.from(raw)],
    ["inbound/other", Buffer.from(raw)],
  ]);
  const received = [];
  const client = {
    async send(command) {
      const name = command.constructor.name;
      if (name === "ListObjectsV2Command") {
        return {
          Contents: [...objects.keys()].map((Key) => ({ Key })),
          IsTruncated: false,
        };
      }
      if (name === "GetObjectCommand") {
        const value = objects.get(command.input.Key);
        if (!value) throw new Error("NoSuchKey");
        return {
          Body: {
            async transformToByteArray() {
              return new Uint8Array(value);
            },
          },
        };
      }
      if (name === "DeleteObjectCommand") {
        objects.delete(command.input.Key);
        return {};
      }
      throw new Error(name);
    },
  };

  const { processInboundS3Queue } = await import("../src/lib/inbound-s3.ts");
  const result = await processInboundS3Queue({
    client,
    environment: {
      PAPERBOY_INBOUND_S3_BUCKET: "paperboy-inbound",
      PAPERBOY_INBOUND_S3_REGION: "ap-northeast-1",
    },
    receive: async ({ principal, payload }) => {
      received.push({ orgId: principal.orgId, hasEmail: Boolean(payload.email) });
      return {
        bcc: [],
        cc: [],
        createdAt: new Date("2026-08-26T00:00:00.000Z"),
        environment: "live",
        from: "jane@example.com",
        html: null,
        id: "11111111-1111-4111-8111-111111111111",
        messageId: "orig@example.com",
        replayed: false,
        subject: "Re: My ticket",
        text: "The printer is still jammed.",
        to: ["reply+abc123@snagspot.app"],
      };
    },
    resolveOrg: async (to) =>
      to.some((address) => address.includes("snagspot.app"))
        ? "f8b090ae-4ba0-4c09-a8e5-86abe5e6eafb"
        : null,
  });

  assert.equal(result.deleted, 2);
  assert.equal(result.skipped, 1);
  assert.equal(received.length, 2);
  assert.equal(received[0].orgId, "f8b090ae-4ba0-4c09-a8e5-86abe5e6eafb");
  assert.equal(objects.has("inbound/ok"), false);
  assert.equal(objects.has("inbound/AMAZON_SES_SETUP_NOTIFICATION"), true);
});
