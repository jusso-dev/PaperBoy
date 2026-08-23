import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  createWebhookSigningSecret,
  encryptWebhookSigningSecret,
  verifyWebhookSignature,
  webhookEventBody,
} from "../src/lib/webhook-core.ts";
import { processNextWebhook } from "../src/lib/webhook-worker-core.ts";

const firstAttemptAt = new Date("2026-08-24T01:02:03.000Z");
const secondAttemptAt = new Date("2026-08-24T01:03:03.000Z");

function fakeStore(claim) {
  let available = true;
  let attemptCount = 0;
  const calls = [];

  return {
    calls,
    store: {
      async claim(input) {
        calls.push(["claim", input]);

        if (!available) return null;
        available = false;
        attemptCount += 1;
        return { ...claim, attemptCount };
      },
      async markDelivered(input) {
        calls.push(["markDelivered", input]);
        return true;
      },
      async markFailed(input) {
        calls.push(["markFailed", input]);
        return true;
      },
      async markRetry(input) {
        calls.push(["markRetry", input]);
        available = true;
        return true;
      },
    },
  };
}

test("local receiver verifies retries and 2xx stops delivery", async () => {
  const encryptionKey = Buffer.alloc(32, 9);
  const secret = createWebhookSigningSecret();
  const endpointId = "11111111-1111-4111-8111-111111111111";
  const eventId = "22222222-2222-4222-8222-222222222222";
  const orgId = "33333333-3333-4333-8333-333333333333";
  const body = webhookEventBody({
    createdAt: firstAttemptAt,
    environment: "live",
    messageId: "44444444-4444-4444-8444-444444444444",
    type: "delivered",
  });
  const requests = [];
  const responseStatuses = [503, 204];
  const server = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      const receivedBody = Buffer.concat(chunks).toString("utf8");
      const timestamp = request.headers["webhook-timestamp"];
      requests.push({
        body: receivedBody,
        headers: request.headers,
        verified: verifyWebhookSignature({
          body: receivedBody,
          headers: {
            "webhook-id": request.headers["webhook-id"],
            "webhook-signature": request.headers["webhook-signature"],
            "webhook-timestamp": timestamp,
          },
          now: new Date(Number(timestamp) * 1000),
          secret,
        }),
      });
      response.statusCode = responseStatuses.shift() ?? 500;
      response.end();
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.equal(typeof address, "object");
  const { calls, store } = fakeStore({
    body,
    encryptedSecret: encryptWebhookSigningSecret({
      context: { endpointId, orgId },
      encryptionKey,
      secret,
    }),
    endpointId,
    eventId,
    id: "55555555-5555-4555-8555-555555555555",
    orgId,
    url: `http://127.0.0.1:${address.port}/paperboy`,
  });

  try {
    const first = await processNextWebhook({
      encryptionKey,
      now: () => firstAttemptAt,
      store,
      workerId: "webhook-worker",
    });
    const retry = calls.find(([operation]) => operation === "markRetry")[1];

    assert.deepEqual(first, {
      deliveryId: "55555555-5555-4555-8555-555555555555",
      state: "retry",
    });
    assert.equal(retry.code, "webhook_http_503");
    assert.equal(retry.responseStatus, 503);
    assert.equal(
      retry.nextAttemptAt.toISOString(),
      secondAttemptAt.toISOString(),
    );

    const second = await processNextWebhook({
      encryptionKey,
      now: () => secondAttemptAt,
      store,
      workerId: "webhook-worker",
    });

    assert.deepEqual(second, {
      deliveryId: "55555555-5555-4555-8555-555555555555",
      state: "delivered",
    });
    assert.equal(
      calls.filter(([operation]) => operation === "markRetry").length,
      1,
    );
    assert.equal(
      calls.filter(([operation]) => operation === "markDelivered").length,
      1,
    );
    assert.equal(calls.some(([operation]) => operation === "markFailed"), false);
    assert.equal(requests.length, 2);
    assert.equal(requests.every((received) => received.verified), true);
    assert.equal(requests.every((received) => received.body === body), true);
    assert.equal(requests[0].headers["webhook-id"], eventId);
    assert.equal(requests[1].headers["webhook-id"], eventId);
    assert.notEqual(
      requests[0].headers["webhook-signature"],
      requests[1].headers["webhook-signature"],
    );
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("4xx fails once without retry", async () => {
  const encryptionKey = Buffer.alloc(32, 4);
  const endpointId = "66666666-6666-4666-8666-666666666666";
  const orgId = "77777777-7777-4777-8777-777777777777";
  const secret = createWebhookSigningSecret();
  const { calls, store } = fakeStore({
    body: "{}",
    encryptedSecret: encryptWebhookSigningSecret({
      context: { endpointId, orgId },
      encryptionKey,
      secret,
    }),
    endpointId,
    eventId: "88888888-8888-4888-8888-888888888888",
    id: "99999999-9999-4999-8999-999999999999",
    orgId,
    url: "https://hooks.example.com/paperboy",
  });
  const result = await processNextWebhook({
    encryptionKey,
    fetch: async () => new Response(null, { status: 400 }),
    now: () => firstAttemptAt,
    store,
    workerId: "webhook-worker",
  });
  const failed = calls.find(([operation]) => operation === "markFailed")[1];

  assert.equal(result.state, "failed");
  assert.equal(failed.code, "webhook_http_400");
  assert.equal(failed.responseStatus, 400);
  assert.equal(calls.some(([operation]) => operation === "markRetry"), false);
});
