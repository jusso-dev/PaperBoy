import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../src/lib/authorization.ts";
import { OutboundProviderConfigurationError } from "../src/lib/outbound-provider-configuration.ts";
import {
  handleGetOutboundProvidersRequest,
  handleTestOutboundProviderRequest,
  handleUpdateOutboundProvidersRequest,
} from "../src/lib/outbound-provider-http.ts";
import { OutboundProviderSettingsError } from "../src/lib/outbound-providers.ts";

const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const fixedNow = new Date("2026-08-24T02:03:04.000Z");
const domainId = "22222222-2222-4222-8222-222222222222";

function settings() {
  return {
    defaultProvider: "smtp",
    domains: [
      {
        effectiveProvider: "cloudflare-email",
        id: domainId,
        name: "mail.example.com",
        overrideProvider: "cloudflare-email",
        updatedAt: fixedNow,
      },
    ],
    providers: [
      {
        capabilities: { batch: false, events: true, scheduling: false },
        configured: true,
        credentialScope: "operator-default",
        id: "smtp",
        label: "SMTP",
        state: "ready",
      },
    ],
    updatedAt: fixedNow,
  };
}

function dependencies(overrides = {}) {
  return {
    authenticate: async (request) =>
      request.headers.has("authorization") ? principal : null,
    services: {
      get: async () => settings(),
      test: async () => ({ provider: "smtp", testedAt: fixedNow }),
      update: async () => settings(),
      ...overrides,
    },
  };
}

function request(path, method = "GET", body) {
  return new Request(`https://paperboy.test${path}`, {
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    method,
  });
}

test("provider REST reads UTC settings without exposing secret material", async () => {
  const response = await handleGetOutboundProvidersRequest(
    request("/api/v1/providers"),
    dependencies(),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.protocol_time_zone, "UTC");
  assert.equal(body.updated_at, fixedNow.toISOString());
  assert.equal(body.domains[0].effective_provider, "cloudflare-email");
  assert.equal(body.providers[0].credential_scope, "operator-default");
  assert.equal(JSON.stringify(body).includes("password"), false);
  assert.equal(JSON.stringify(body).includes("token"), false);
});

test("provider REST updates and tests through the authenticated tenant service", async () => {
  const calls = [];
  const deps = dependencies({
    async test(received, payload) {
      calls.push(["test", received, payload]);
      return { provider: "cloudflare-email", testedAt: fixedNow };
    },
    async update(received, payload) {
      calls.push(["update", received, payload]);
      return settings();
    },
  });
  const update = await handleUpdateOutboundProvidersRequest(
    request("/api/v1/providers", "PATCH", { default_provider: "smtp" }),
    deps,
  );
  const tested = await handleTestOutboundProviderRequest(
    request("/api/v1/providers/test", "POST", {
      provider: "cloudflare-email",
    }),
    deps,
  );

  assert.equal(update.status, 200);
  assert.equal(tested.status, 200);
  assert.deepEqual(await tested.json(), {
    ok: true,
    protocol_time_zone: "UTC",
    provider: "cloudflare-email",
    tested_at: fixedNow.toISOString(),
  });
  assert.deepEqual(calls, [
    ["update", principal, { default_provider: "smtp" }],
    ["test", principal, { provider: "cloudflare-email" }],
  ]);
});

test("provider REST returns explicit auth, validation, and credential 4xx errors", async () => {
  const unauthorized = await handleGetOutboundProvidersRequest(
    new Request("https://paperboy.test/api/v1/providers"),
    dependencies(),
  );
  const forbidden = await handleUpdateOutboundProvidersRequest(
    request("/api/v1/providers", "PATCH", {}),
    dependencies({
      async update() {
        throw new AuthorizationError("outboundProviders.manage");
      },
    }),
  );
  const invalid = await handleUpdateOutboundProvidersRequest(
    request("/api/v1/providers", "PATCH", {}),
    dependencies({
      async update() {
        throw new OutboundProviderSettingsError("VALIDATION_ERROR", [
          { field: "default_provider", message: "Choose a provider." },
        ]);
      },
    }),
  );
  const missing = await handleTestOutboundProviderRequest(
    request("/api/v1/providers/test", "POST", { provider: "smtp" }),
    dependencies({
      async test() {
        throw new OutboundProviderConfigurationError(
          "CREDENTIALS_MISSING",
          "smtp",
        );
      },
    }),
  );

  assert.equal(unauthorized.status, 401);
  assert.equal(forbidden.status, 403);
  assert.equal(invalid.status, 422);
  assert.equal(missing.status, 422);
  assert.equal((await missing.json()).error.code, "provider_credentials_missing");
});
