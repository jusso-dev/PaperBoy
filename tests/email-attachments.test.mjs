import assert from "node:assert/strict";
import { access, mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { simpleParser } from "mailparser";
import {
  AttachmentStorageError,
  attachmentStorageKey,
  createLocalAttachmentStore,
  verifyStoredAttachment,
} from "../src/lib/attachment-storage.ts";
import {
  DeliveryProviderError,
  buildSmtpMimeMessage,
  prepareCloudflareEmailMessage,
} from "../src/lib/email-delivery.ts";
import {
  EmailError,
  MAX_ATTACHMENT_BYTES,
  emailRequestHash,
  parseSendEmailInput,
} from "../src/lib/email-core.ts";

const fixtureUrl = (name) => new URL(`./fixtures/${name}.b64`, import.meta.url);

async function fixture(name) {
  return Buffer.from((await readFile(fixtureUrl(name), "utf8")).trim(), "base64");
}

function input(attachments) {
  return {
    attachments,
    from: "PaperBoy <sender@example.com>",
    subject: "Files",
    text: "The files are attached.",
    to: "reader@example.net",
  };
}

test("PDF and PNG attachments decode canonically and affect idempotency", async () => {
  const pdf = await fixture("sample.pdf");
  const png = await fixture("sample.png");
  const parsed = parseSendEmailInput(
    input([
      {
        content: pdf.toString("base64"),
        content_type: "application/pdf",
        filename: "invoice.pdf",
      },
      {
        content: png.toString("base64"),
        content_type: "image/png",
        filename: "pixel.png",
      },
    ]),
  );

  assert.equal(parsed.attachments.length, 2);
  assert.deepEqual(parsed.attachments[0].content, pdf);
  assert.deepEqual(parsed.attachments[1].content, png);
  assert.equal(parsed.attachments[0].size, pdf.length);
  assert.match(parsed.attachments[0].contentSha256, /^[0-9a-f]{64}$/);

  const changed = parseSendEmailInput(
    input([
      {
        content: Buffer.concat([pdf, Buffer.from("changed")]).toString(
          "base64",
        ),
        content_type: "application/pdf",
        filename: "invoice.pdf",
      },
      {
        content: png.toString("base64"),
        content_type: "image/png",
        filename: "pixel.png",
      },
    ]),
  );

  assert.notEqual(emailRequestHash(parsed), emailRequestHash(changed));
});

test("attachment validation rejects paths, malformed MIME types, and bad Base64", () => {
  assert.throws(
    () =>
      parseSendEmailInput(
        input([
          {
            content: "not base64",
            content_type: "image/png; charset=utf-8",
            filename: "../secret.png",
          },
        ]),
      ),
    (error) => {
      assert.ok(error instanceof EmailError);
      assert.deepEqual(
        error.issues.map((issue) => issue.field),
        [
          "attachments.0.content",
          "attachments.0.filename",
          "attachments.0.content_type",
        ],
      );
      return true;
    },
  );
});

test("decoded attachments have a 10 MiB aggregate cap", () => {
  const first = Buffer.alloc(MAX_ATTACHMENT_BYTES / 2).toString("base64");
  const second = Buffer.alloc(MAX_ATTACHMENT_BYTES / 2 + 1).toString("base64");

  assert.throws(
    () =>
      parseSendEmailInput(
        input([
          {
            content: first,
            content_type: "application/octet-stream",
            filename: "first.bin",
          },
          {
            content: second,
            content_type: "application/octet-stream",
            filename: "second.bin",
          },
        ]),
      ),
    (error) =>
      error instanceof EmailError && error.code === "ATTACHMENTS_TOO_LARGE",
  );
});

test("batch parsing rejects attachments explicitly", async () => {
  const pdf = await fixture("sample.pdf");

  assert.throws(
    () =>
      parseSendEmailInput(
        input([
          {
            content: pdf.toString("base64"),
            content_type: "application/pdf",
            filename: "invoice.pdf",
          },
        ]),
        { allowAttachments: false },
      ),
    (error) => {
      assert.ok(error instanceof EmailError);
      assert.deepEqual(error.issues, [
        {
          field: "attachments",
          message: "Attachments are not supported by the batch endpoint.",
        },
      ]);
      return true;
    },
  );
});

test("attachment count is capped before decoding more than 100 files", () => {
  const attachments = Array.from({ length: 101 }, (_, index) => ({
    content: Buffer.from(String(index)).toString("base64"),
    content_type: "text/plain",
    filename: `file-${index}.txt`,
  }));

  assert.throws(
    () => parseSendEmailInput(input(attachments)),
    (error) => {
      assert.ok(error instanceof EmailError);
      assert.deepEqual(error.issues, [
        {
          field: "attachments",
          message: "Must contain at most 100 files.",
        },
      ]);
      return true;
    },
  );
});

test("private local storage uses generated keys, restrictive modes, and integrity checks", async () => {
  const root = await mkdtemp(join(tmpdir(), "paperboy-attachments-"));
  const store = createLocalAttachmentStore(root);
  const storageKey = attachmentStorageKey({
    attachmentId: "33333333-3333-4333-8333-333333333333",
    messageId: "22222222-2222-4222-8222-222222222222",
    orgId: "11111111-1111-4111-8111-111111111111",
  });
  const content = Buffer.from("private attachment");
  const path = join(root, storageKey);

  try {
    await store.put({ content, storageKey });
    assert.deepEqual(await store.read(storageKey), content);
    await assert.rejects(
      store.put({ content: Buffer.from("replacement"), storageKey }),
      (error) =>
        error instanceof AttachmentStorageError &&
        error.code === "WRITE_FAILED",
    );
    assert.deepEqual(await store.read(storageKey), content);
    assert.equal((await stat(root)).mode & 0o777, 0o700);
    assert.equal((await stat(path)).mode & 0o777, 0o600);
    assert.throws(
      () => verifyStoredAttachment({
        content: Buffer.from("tampered"),
        contentSha256:
          "75fc9d66d3e9e9f9d81eb99a1ecf62a9e39388980717d84671b5f49c3e560b5e",
        size: content.length,
      }),
      (error) =>
        error instanceof AttachmentStorageError &&
        error.code === "INTEGRITY_FAILED",
    );
    await assert.rejects(
      store.read("../../private-file"),
      (error) =>
        error instanceof AttachmentStorageError &&
        error.code === "INTEGRITY_FAILED",
    );
    await store.delete(storageKey);
    await assert.rejects(access(path));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("SMTP MIME contains both fixture bytes with declared filenames and types", async () => {
  const pdf = await fixture("sample.pdf");
  const png = await fixture("sample.png");
  const raw = await buildSmtpMimeMessage({
    attachments: [
      { content: pdf, contentType: "application/pdf", filename: "invoice.pdf" },
      { content: png, contentType: "image/png", filename: "pixel.png" },
    ],
    date: new Date("2026-08-23T13:00:00.000Z"),
    from: "PaperBoy <sender@example.com>",
    html: "<p>The files are attached.</p>",
    messageId: "paperboy-attachment-proof@example.com",
    subject: "Files",
    text: "The files are attached.",
    to: ["reader@example.net"],
  });
  const parsed = await simpleParser(raw);

  assert.equal(parsed.attachments.length, 2);
  assert.deepEqual(parsed.attachments[0].content, pdf);
  assert.equal(parsed.attachments[0].filename, "invoice.pdf");
  assert.equal(parsed.attachments[0].contentType, "application/pdf");
  assert.deepEqual(parsed.attachments[1].content, png);
  assert.equal(parsed.attachments[1].filename, "pixel.png");
  assert.equal(parsed.attachments[1].contentType, "image/png");
});

test("Cloudflare receives structured Base64 attachments without Date or DKIM", async () => {
  const pdf = await fixture("sample.pdf");
  const payload = prepareCloudflareEmailMessage({
    attachments: [
      { content: pdf, contentType: "application/pdf", filename: "invoice.pdf" },
    ],
    from: "sender@example.com",
    html: "<p>The file is attached.</p>",
    subject: "Cloudflare attachment",
    text: null,
    to: ["reader@example.net"],
  });

  assert.deepEqual(Buffer.from(payload.attachments[0].content, "base64"), pdf);
  assert.deepEqual(payload.attachments[0], {
    content: pdf.toString("base64"),
    disposition: "attachment",
    filename: "invoice.pdf",
    type: "application/pdf",
  });
  assert.equal("date" in payload, false);
  assert.equal("headers" in payload, false);
  assert.equal("dkim" in payload, false);

  assert.throws(
    () =>
      prepareCloudflareEmailMessage({
        attachments: [
          {
            content: Buffer.alloc(4 * 1024 * 1024),
            contentType: "application/octet-stream",
            filename: "provider-too-large.bin",
          },
        ],
        from: "sender@example.com",
        html: null,
        subject: "Too large after Base64",
        text: "Body",
        to: ["reader@example.net"],
      }),
    (error) =>
      error instanceof DeliveryProviderError &&
      error.code === "MESSAGE_TOO_LARGE",
  );
});
