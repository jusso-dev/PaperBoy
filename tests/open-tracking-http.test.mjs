import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../src/lib/authorization.ts";
import {
  OpenTrackingConfigurationError,
  OpenTrackingSettingsError,
} from "../src/lib/open-tracking-core.ts";
import {
  handleGetOpenTrackingRequest,
  handleOpenTrackingPixelRequest,
  handleUpdateOpenTrackingRequest,
} from "../src/lib/open-tracking-http.ts";

const principal = {
  actorUserId: "open-tracking-admin",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const settings = {
  enabled: false,
  updatedAt: new Date("2026-08-24T01:02:03.456Z"),
};

function request(method = "GET", body) {
  return new Request("https://paperboy.test/api/v1/open-tracking", {
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    method,
  });
}

test("open-tracking REST reads and updates the authenticated organization", async () => {
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
        return { ...settings, enabled: true };
      },
    },
  };
  const get = await handleGetOpenTrackingRequest(request(), dependencies);
  const patch = await handleUpdateOpenTrackingRequest(
    request("PATCH", { enabled: true }),
    dependencies,
  );
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), {
    enabled: false,
    protocol_time_zone: "UTC",
    updated_at: "2026-08-24T01:02:03.456Z",
  });
  assert.equal((await patch.json()).enabled, true);
  assert.deepEqual(calls, [
    ["get", principal],
    ["update", principal, { enabled: true }],
  ]);
});

test("open-tracking REST returns explicit auth, validation, and configuration errors", async () => {
  const unauthorized = await handleGetOpenTrackingRequest(request(), {
    authenticate: async () => null,
    services: { get: async () => settings, update: async () => settings },
  });
  const cases = [
    [new AuthorizationError("openTracking.manage"), 403, "forbidden"],
    [
      new OpenTrackingSettingsError("VALIDATION_ERROR", [
        { field: "enabled", message: "Must be true or false." },
      ]),
      422,
      "validation_error",
    ],
    [new OpenTrackingConfigurationError(), 503, "open_tracking_unavailable"],
  ];
  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("WWW-Authenticate"), /Bearer/);
  for (const [error, status, code] of cases) {
    const response = await handleUpdateOpenTrackingRequest(
      request("PATCH", { enabled: true }),
      {
        authenticate: async () => principal,
        services: {
          get: async () => settings,
          update: async () => {
            throw error;
          },
        },
      },
    );
    assert.equal(response.status, status);
    assert.equal((await response.json()).error.code, code);
  }
});

test("tracking pixel response is identical and uncacheable for valid and invalid hits", async () => {
  const calls = [];
  const dependencies = {
    record: async (input) => {
      calls.push(input);
      return calls.length === 1;
    },
  };
  const input = {
    messageId: "11111111-1111-4111-8111-111111111111",
    signature: "signature",
  };
  const first = await handleOpenTrackingPixelRequest(input, dependencies);
  const second = await handleOpenTrackingPixelRequest(input, dependencies);
  const [firstBytes, secondBytes] = await Promise.all([
    first.arrayBuffer(),
    second.arrayBuffer(),
  ]);

  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Content-Type"), "image/gif");
  assert.match(first.headers.get("Cache-Control"), /no-store/);
  assert.equal(first.headers.get("Cross-Origin-Resource-Policy"), "cross-origin");
  assert.equal(first.headers.has("Set-Cookie"), false);
  assert.deepEqual(Buffer.from(firstBytes), Buffer.from(secondBytes));
  assert.equal(calls.length, 2);
});
