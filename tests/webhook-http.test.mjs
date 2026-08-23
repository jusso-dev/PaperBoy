import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../src/lib/authorization.ts";
import { WebhookError } from "../src/lib/webhook-core.ts";
import {
  handleConfigureWebhookRequest,
  handleGetWebhookRequest,
} from "../src/lib/webhook-http.ts";

const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const endpoint = {
  createdAt: new Date("2026-08-24T01:00:00.000Z"),
  id: "22222222-2222-4222-8222-222222222222",
  updatedAt: new Date("2026-08-24T01:01:00.000Z"),
  url: "https://hooks.example.com/paperboy",
};

function request(method = "GET", body) {
  return new Request("https://paperboy.test/api/v1/webhooks", {
    body,
    headers: { Authorization: "Bearer test-key" },
    method,
  });
}

function dependencies(overrides = {}) {
  return {
    authenticate: async (received) =>
      received.headers.has("authorization") ? principal : null,
    services: {
      configure: async () => ({
        endpoint,
        signingSecret: "whsec_shown-once",
      }),
      get: async () => endpoint,
      ...overrides,
    },
  };
}

test("webhook REST configuration returns its signing secret once with UTC", async () => {
  let received;
  const response = await handleConfigureWebhookRequest(
    request("PUT", JSON.stringify({ url: endpoint.url })),
    dependencies({
      async configure(receivedPrincipal, payload) {
        received = [receivedPrincipal, payload];
        return { endpoint, signingSecret: "whsec_shown-once" };
      },
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(received, [principal, { url: endpoint.url }]);
  assert.equal(body.data.signing_secret, "whsec_shown-once");
  assert.equal(body.data.created_at, endpoint.createdAt.toISOString());
  assert.equal(body.data.updated_at, endpoint.updatedAt.toISOString());
});

test("webhook REST reads configuration without returning encrypted or raw secrets", async () => {
  const response = await handleGetWebhookRequest(request(), dependencies());
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(body, {
    data: {
      created_at: endpoint.createdAt.toISOString(),
      id: endpoint.id,
      updated_at: endpoint.updatedAt.toISOString(),
      url: endpoint.url,
    },
  });
  assert.equal(JSON.stringify(body).includes("secret"), false);
});

test("webhook REST rejects invalid JSON, invalid URLs, and insufficient roles", async () => {
  const invalidJson = await handleConfigureWebhookRequest(
    request("PUT", "{"),
    dependencies(),
  );
  const invalidUrl = await handleConfigureWebhookRequest(
    request("PUT", JSON.stringify({ url: "http://public.example.com" })),
    dependencies({
      async configure() {
        throw new WebhookError("INVALID_URL");
      },
    }),
  );
  const forbidden = await handleGetWebhookRequest(
    request(),
    dependencies({
      async get() {
        throw new AuthorizationError("webhooks.read");
      },
    }),
  );

  assert.equal(invalidJson.status, 400);
  assert.equal(invalidUrl.status, 422);
  assert.equal(forbidden.status, 403);
});
