import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../src/lib/authorization.ts";
import { RateLimitSettingsError } from "../src/lib/rate-limit-core.ts";
import {
  handleGetRateLimitsRequest,
  handleUpdateRateLimitsRequest,
} from "../src/lib/rate-limit-http.ts";

const principal = {
  actorUserId: "rate-limit-admin",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const settings = {
  defaultLiveLimitPerMinute: 60,
  defaultTestLimitPerMinute: 600,
  liveLimitPerMinute: 90,
  liveOverridePerMinute: 90,
  testLimitPerMinute: 900,
  testOverridePerMinute: 900,
  updatedAt: new Date("2026-08-24T01:02:03.456Z"),
};

function request(method = "GET", body) {
  return new Request("https://paperboy.test/api/v1/rate-limits", {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    method,
  });
}

test("rate-limit REST reads and updates only the authenticated organization", async () => {
  const calls = [];
  const dependencies = {
    authenticate: async () => principal,
    services: {
      get: async (received) => {
        calls.push(["get", received]);
        return settings;
      },
      update: async (received, payload) => {
        calls.push(["update", received, payload]);
        return settings;
      },
    },
  };
  const get = await handleGetRateLimitsRequest(request(), dependencies);
  const patch = await handleUpdateRateLimitsRequest(
    request("PATCH", {
      live_limit_per_minute: 90,
      test_limit_per_minute: 900,
    }),
    dependencies,
  );
  const body = await get.json();

  assert.equal(get.status, 200);
  assert.equal(patch.status, 200);
  assert.equal(get.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(body.live, {
    default_limit_per_minute: 60,
    limit_per_minute: 90,
    override_limit_per_minute: 90,
  });
  assert.equal(body.protocol_time_zone, "UTC");
  assert.equal(body.updated_at, "2026-08-24T01:02:03.456Z");
  assert.deepEqual(calls, [
    ["get", principal],
    [
      "update",
      principal,
      { live_limit_per_minute: 90, test_limit_per_minute: 900 },
    ],
  ]);
});

test("rate-limit REST returns explicit auth and validation errors", async () => {
  const unauthorized = await handleGetRateLimitsRequest(request(), {
    authenticate: async () => null,
    services: { get: async () => settings, update: async () => settings },
  });
  const forbidden = await handleUpdateRateLimitsRequest(request("PATCH", {}), {
    authenticate: async () => principal,
    services: {
      get: async () => settings,
      update: async () => {
        throw new AuthorizationError("rateLimits.manage");
      },
    },
  });
  const invalid = await handleUpdateRateLimitsRequest(request("PATCH", {}), {
    authenticate: async () => principal,
    services: {
      get: async () => settings,
      update: async () => {
        throw new RateLimitSettingsError("VALIDATION_ERROR", [
          { field: "body", message: "Provide a limit." },
        ]);
      },
    },
  });

  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("WWW-Authenticate"), /Bearer/);
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "forbidden");
  assert.equal(invalid.status, 422);
  assert.equal((await invalid.json()).error.fields[0].field, "body");
});
