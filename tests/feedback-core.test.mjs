import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  decodeFeedbackReportBase64,
  FeedbackError,
  MAX_FEEDBACK_REPORT_BYTES,
  parseFeedbackReport,
} from "../src/lib/feedback-core.ts";

const fixture = (name) =>
  readFile(new URL(`fixtures/feedback/${name}.eml`, import.meta.url));

test("RFC 3464 fixtures classify permanent and transient bounces", async () => {
  const hard = await parseFeedbackReport(await fixture("hard-bounce"));
  const soft = await parseFeedbackReport(await fixture("soft-bounce"));

  assert.deepEqual(hard.outcomes, [
    {
      classification: "hard_bounce",
      messageId: "11111111-1111-4111-8111-111111111111",
      recipient: "hard-bounce@example.net",
      status: "5.1.1",
    },
  ]);
  assert.deepEqual(soft.outcomes, [
    {
      classification: "soft_bounce",
      messageId: "22222222-2222-4222-8222-222222222222",
      recipient: "soft-bounce@example.net",
      status: "4.2.2",
    },
  ]);
  assert.match(hard.reportSha256, /^[0-9a-f]{64}$/);
  assert.notEqual(hard.reportSha256, soft.reportSha256);
});

test("RFC 5965 fixture becomes one correlated complaint", async () => {
  const complaint = await parseFeedbackReport(await fixture("complaint"));

  assert.deepEqual(complaint.outcomes, [
    {
      classification: "complaint",
      messageId: "33333333-3333-4333-8333-333333333333",
      recipient: "complaint@example.net",
      status: null,
    },
  ]);
});

test("feedback Base64 decoding is canonical and bounded", async () => {
  const raw = await fixture("hard-bounce");
  assert.deepEqual(decodeFeedbackReportBase64(raw.toString("base64")), raw);
  assert.throws(() => decodeFeedbackReportBase64("not base64"), FeedbackError);
  await assert.rejects(
    () => parseFeedbackReport(Buffer.alloc(MAX_FEEDBACK_REPORT_BYTES + 1)),
    (error) =>
      error instanceof FeedbackError && error.code === "REPORT_TOO_LARGE",
  );
});

test("ordinary messages and ambiguous report IDs are rejected", async () => {
  await assert.rejects(
    () =>
      parseFeedbackReport(
        Buffer.from("From: sender@example.com\nTo: reader@example.net\n\nHello"),
      ),
    (error) =>
      error instanceof FeedbackError && error.code === "INVALID_REPORT",
  );
  const raw = await fixture("hard-bounce");
  await assert.rejects(
    () =>
      parseFeedbackReport(
        Buffer.from(
          raw
            .toString("utf8")
            .replace(
              "X-PaperBoy-Message-ID: 11111111-1111-4111-8111-111111111111",
              "X-PaperBoy-Message-ID: 44444444-4444-4444-8444-444444444444",
            ),
        ),
      ),
    (error) =>
      error instanceof FeedbackError && error.code === "INVALID_REPORT",
  );
});
