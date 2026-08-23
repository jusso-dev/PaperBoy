import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import test from "node:test";
import { PaperBoy } from "../packages/sdk/src/index.ts";

const messageId = "22222222-2222-4222-8222-222222222222";

async function requestBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

test("TypeScript SDK sends one email and gets it from a test HTTP server", async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    requests.push({
      authorization: request.headers.authorization,
      idempotencyKey: request.headers["idempotency-key"],
      method: request.method,
      url: request.url,
    });
    response.setHeader("Content-Type", "application/json");

    if (request.method === "POST" && request.url === "/api/v1/emails") {
      const body = await requestBody(request);
      assert.equal(body.subject, "SDK proof");
      assert.deepEqual(body.to, ["reader@example.net"]);
      response.end(JSON.stringify({ id: messageId }));
      return;
    }

    if (
      request.method === "GET" &&
      request.url === `/api/v1/emails/${messageId}`
    ) {
      response.end(
        JSON.stringify({
          attachments: [],
          attempt_count: 0,
          created_at: "2026-08-24T00:00:00.000Z",
          delivery_mode: "test-sink",
          domain_id: null,
          environment: "test",
          failed_at: null,
          failure_reason: null,
          from: "news@example.com",
          html: null,
          id: messageId,
          last_attempt_at: null,
          last_error_code: null,
          next_attempt_at: "2026-08-24T00:00:00.000Z",
          object: "email",
          open_tracking_enabled: false,
          provider: "test-sink",
          sent_at: null,
          status: "queued",
          subject: "SDK proof",
          tags: [],
          text: "Provider-neutral body",
          to: ["reader@example.net"],
          updated_at: "2026-08-24T00:00:00.000Z",
        }),
      );
      return;
    }

    response.statusCode = 404;
    response.end(JSON.stringify({ error: { code: "not_found", message: "Missing" } }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");

  try {
    const address = server.address();
    assert.equal(typeof address, "object");
    const client = new PaperBoy({
      apiKey: "pb_test_sdk-proof",
      baseUrl: `http://127.0.0.1:${address.port}`,
    });
    const queued = await client.send(
      {
        from: "news@example.com",
        subject: "SDK proof",
        text: "Provider-neutral body",
        to: ["reader@example.net"],
      },
      { idempotencyKey: "sdk-proof-1" },
    );
    const message = await client.get(queued.id);

    assert.equal(queued.id, messageId);
    assert.equal(message.id, messageId);
    assert.equal(message.created_at, "2026-08-24T00:00:00.000Z");
    assert.deepEqual(requests, [
      {
        authorization: "Bearer pb_test_sdk-proof",
        idempotencyKey: "sdk-proof-1",
        method: "POST",
        url: "/api/v1/emails",
      },
      {
        authorization: "Bearer pb_test_sdk-proof",
        idempotencyKey: undefined,
        method: "GET",
        url: `/api/v1/emails/${messageId}`,
      },
    ]);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
