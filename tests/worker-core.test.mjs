import assert from "node:assert/strict";
import test from "node:test";
import {
  DeliveryProviderError,
  buildSmtpMimeMessage,
  prepareCloudflareEmailMessage,
} from "../src/lib/email-delivery.ts";
import {
  DELIVERY_LEASE_MS,
  OutboundDeliveryError,
  httpDeliveryError,
  processNextMessage,
  smtpDeliveryError,
  testSinkAdapter,
} from "../src/lib/worker-core.ts";

const fixedNow = new Date("2026-08-23T01:02:03.456Z");

function message(overrides = {}) {
  return {
    attemptCount: 1,
    deliveryMode: "live",
    environment: "live",
    from: "PaperBoy <news@example.com>",
    html: "<p>Private edition</p>",
    id: "11111111-1111-4111-8111-111111111111",
    subject: "Morning edition",
    text: "Private edition",
    to: ["reader@example.net"],
    ...overrides,
  };
}

function fakeStore(claim, attachments = []) {
  let available = Boolean(claim);
  const calls = [];
  const store = {
    async claim(input) {
      calls.push(["claim", input]);
      if (!available) return null;
      available = false;
      return claim;
    },
    async loadAttachments(messageId) {
      calls.push(["loadAttachments", messageId]);
      return attachments;
    },
    async markFailed(input) {
      calls.push(["markFailed", input]);
      return true;
    },
    async markRetry(input) {
      calls.push(["markRetry", input]);
      return true;
    },
    async markSent(input) {
      calls.push(["markSent", input]);
      return true;
    },
  };

  return { calls, store };
}

test("a fake MTA receives the same semantic message as Cloudflare", async () => {
  const attachment = {
    content: Buffer.from("worker attachment"),
    contentType: "text/plain",
    filename: "edition.txt",
  };
  const { calls, store } = fakeStore(message(), [attachment]);
  let cloudflarePayload;
  let smtpMime;
  const adapter = {
    name: "fake-mta",
    async send(delivery) {
      smtpMime = await buildSmtpMimeMessage(delivery);
      cloudflarePayload = prepareCloudflareEmailMessage(delivery);
    },
  };

  const result = await processNextMessage({
    adapter,
    deliveryModes: ["live"],
    now: () => fixedNow,
    store,
    workerId: "fake-mta-1",
  });

  assert.deepEqual(result, { messageId: message().id, state: "sent" });
  assert.match(smtpMime.toString(), /Morning edition/);
  assert.match(smtpMime.toString(), /edition\.txt/);
  assert.deepEqual(cloudflarePayload, {
    attachments: [
      {
        content: attachment.content.toString("base64"),
        disposition: "attachment",
        filename: attachment.filename,
        type: attachment.contentType,
      },
    ],
    from: message().from,
    html: message().html,
    subject: message().subject,
    text: message().text,
    to: message().to,
  });
  assert.equal("date" in cloudflarePayload, false);
  assert.equal("dkim" in cloudflarePayload, false);
  assert.equal(calls.at(-1)[0], "markSent");
  assert.equal(calls.at(-1)[1].now.toISOString(), fixedNow.toISOString());
  assert.equal(
    calls[0][1].leaseExpiresAt.toISOString(),
    new Date(fixedNow.getTime() + DELIVERY_LEASE_MS).toISOString(),
  );
});

test("HTTP 5xx is stored for retry with bounded backoff", async () => {
  const { calls, store } = fakeStore(message({ attemptCount: 1 }));
  const result = await processNextMessage({
    adapter: {
      name: "fake-http",
      async send() {
        throw httpDeliveryError(503);
      },
    },
    deliveryModes: ["live"],
    now: () => fixedNow,
    store,
    workerId: "http-worker",
  });
  const retry = calls.find(([operation]) => operation === "markRetry")[1];

  assert.deepEqual(result, { messageId: message().id, state: "retry" });
  assert.equal(retry.code, "http_503");
  assert.equal(retry.reason, "Outbound HTTP provider returned 503.");
  assert.equal(
    retry.nextAttemptAt.toISOString(),
    "2026-08-23T01:03:03.456Z",
  );
  assert.equal(calls.some(([operation]) => operation === "markFailed"), false);
});

test("SMTP 550 fails once and stores a safe permanent reason", async () => {
  const { calls, store } = fakeStore(message());
  const result = await processNextMessage({
    adapter: {
      name: "fake-mta",
      async send() {
        throw smtpDeliveryError(550);
      },
    },
    deliveryModes: ["live"],
    now: () => fixedNow,
    store,
    workerId: "smtp-worker",
  });
  const failed = calls.find(([operation]) => operation === "markFailed")[1];

  assert.deepEqual(result, { messageId: message().id, state: "failed" });
  assert.equal(failed.code, "smtp_550");
  assert.equal(failed.reason, "SMTP server returned 550.");
  assert.equal(calls.some(([operation]) => operation === "markRetry"), false);
});

test("Cloudflare's size rejection is permanent instead of wasting retries", async () => {
  const { calls, store } = fakeStore(message());
  const result = await processNextMessage({
    adapter: {
      name: "fake-cloudflare",
      async send() {
        throw new DeliveryProviderError("MESSAGE_TOO_LARGE");
      },
    },
    deliveryModes: ["live"],
    now: () => fixedNow,
    store,
    workerId: "cloudflare-worker",
  });
  const failed = calls.find(([operation]) => operation === "markFailed")[1];

  assert.equal(result.state, "failed");
  assert.equal(failed.code, "message_too_large");
  assert.equal(failed.reason, "Outbound provider rejected the message size.");
  assert.equal(calls.some(([operation]) => operation === "markRetry"), false);
});

test("the fifth transient failure exhausts retries and sanitizes diagnostics", async () => {
  const { calls, store } = fakeStore(message({ attemptCount: 5 }));
  const result = await processNextMessage({
    adapter: {
      name: "fake-http",
      async send() {
        throw new OutboundDeliveryError({
          code: "HTTP 503 unsafe!",
          reason: "Temporary\nprivate\tprovider failure.",
          retryable: true,
        });
      },
    },
    deliveryModes: ["live"],
    now: () => fixedNow,
    store,
    workerId: "retry-worker",
  });
  const failed = calls.find(([operation]) => operation === "markFailed")[1];

  assert.equal(result.state, "failed");
  assert.equal(failed.code, "http_503_unsafe_");
  assert.equal(
    failed.reason,
    "Retry limit reached after 5 attempts. Temporary private provider failure.",
  );
});

test("the built-in sink accepts test mail and rejects live mail", async () => {
  await testSinkAdapter.send({
    ...message({ deliveryMode: "test-sink", environment: "test" }),
    attachments: [],
  });

  await assert.rejects(
    testSinkAdapter.send({ ...message(), attachments: [] }),
    (error) =>
      error instanceof OutboundDeliveryError &&
      error.code === "adapter_unavailable" &&
      error.retryable === false,
  );
});
