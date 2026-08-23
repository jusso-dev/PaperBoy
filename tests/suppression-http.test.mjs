import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../src/lib/authorization.ts";
import {
  MAX_SUPPRESSION_CSV_BYTES,
  SuppressionError,
} from "../src/lib/suppression-core.ts";
import {
  handleCreateSuppressionRequest,
  handleDeleteSuppressionRequest,
  handleGetSuppressionRequest,
  handleImportSuppressionsRequest,
  handleListSuppressionsRequest,
  handleUpdateSuppressionRequest,
} from "../src/lib/suppression-http.ts";

const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const fixedNow = new Date("2026-08-24T05:06:07.890Z");
const suppression = {
  createdAt: fixedNow,
  email: "reader@example.net",
  id: "33333333-3333-4333-8333-333333333333",
  reason: "manual",
  updatedAt: fixedNow,
};

function services(overrides = {}) {
  return {
    create: async () => suppression,
    delete: async () => undefined,
    get: async () => suppression,
    import: async () => ({
      created: 1,
      importedAt: fixedNow,
      inputRows: 2,
      unchanged: 1,
      uniqueRows: 2,
      updated: 0,
    }),
    list: async () => [suppression],
    update: async () => suppression,
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    authenticate: async (request) =>
      request.headers.get("authorization") === "Bearer valid"
        ? principal
        : null,
    services: services(),
    ...overrides,
  };
}

function request(method, url, body, contentType = "application/json") {
  return new Request(url, {
    body,
    headers: {
      Authorization: "Bearer valid",
      ...(body === undefined ? {} : { "Content-Type": contentType }),
    },
    method,
  });
}

test("suppression REST CRUD is tenant-bound and serializes UTC", async () => {
  const calls = [];
  const scoped = services({
    create: async (received, payload) => {
      calls.push(["create", received, payload]);
      return suppression;
    },
    delete: async (received, suppressionId) => {
      calls.push(["delete", received, suppressionId]);
    },
    get: async (received, suppressionId) => {
      calls.push(["get", received, suppressionId]);
      return suppression;
    },
    list: async (received, filter) => {
      calls.push(["list", received, filter]);
      return [suppression];
    },
    update: async (received, suppressionId, payload) => {
      calls.push(["update", received, suppressionId, payload]);
      return suppression;
    },
  });
  const deps = dependencies({ services: scoped });
  const listResponse = await handleListSuppressionsRequest(
    request(
      "GET",
      "https://paperboy.test/api/v1/suppressions?query=example.net&reason=manual&limit=25",
    ),
    deps,
  );
  const createPayload = { email: suppression.email, reason: "manual" };
  const createResponse = await handleCreateSuppressionRequest(
    request(
      "POST",
      "https://paperboy.test/api/v1/suppressions",
      JSON.stringify(createPayload),
    ),
    deps,
  );
  const getResponse = await handleGetSuppressionRequest(
    request("GET", "https://paperboy.test/api/v1/suppressions/id"),
    suppression.id,
    deps,
  );
  const updatePayload = { reason: "bounced" };
  const updateResponse = await handleUpdateSuppressionRequest(
    request(
      "PATCH",
      "https://paperboy.test/api/v1/suppressions/id",
      JSON.stringify(updatePayload),
    ),
    suppression.id,
    deps,
  );
  const deleteResponse = await handleDeleteSuppressionRequest(
    request("DELETE", "https://paperboy.test/api/v1/suppressions/id"),
    suppression.id,
    deps,
  );

  assert.equal(listResponse.status, 200);
  assert.equal(createResponse.status, 201);
  assert.equal(getResponse.status, 200);
  assert.equal(updateResponse.status, 200);
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual((await listResponse.json()).data[0], {
    created_at: fixedNow.toISOString(),
    email: suppression.email,
    id: suppression.id,
    reason: suppression.reason,
    updated_at: fixedNow.toISOString(),
  });
  assert.deepEqual(await deleteResponse.json(), {
    deleted: true,
    id: suppression.id,
  });
  assert.deepEqual(calls, [
    [
      "list",
      principal,
      { limit: "25", query: "example.net", reason: "manual" },
    ],
    ["create", principal, createPayload],
    ["get", principal, suppression.id],
    ["update", principal, suppression.id, updatePayload],
    ["delete", principal, suppression.id],
  ]);
});

test("CSV REST import requires text/csv and returns content-free UTC counts", async () => {
  const calls = [];
  const deps = dependencies({
    services: services({
      import: async (received, csv) => {
        calls.push([received, csv]);
        return {
          created: 1,
          importedAt: fixedNow,
          inputRows: 2,
          unchanged: 1,
          uniqueRows: 2,
          updated: 0,
        };
      },
    }),
  });
  const csv = "email,reason\nreader@example.net,manual\nother@example.net,bounced\n";
  const response = await handleImportSuppressionsRequest(
    request(
      "POST",
      "https://paperboy.test/api/v1/suppressions/import",
      csv,
      "text/csv; charset=utf-8",
    ),
    deps,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    created: 1,
    imported_at: fixedNow.toISOString(),
    input_rows: 2,
    protocol_time_zone: "UTC",
    unchanged: 1,
    unique_rows: 2,
    updated: 0,
  });
  assert.deepEqual(calls, [[principal, csv]]);

  const wrongType = await handleImportSuppressionsRequest(
    request(
      "POST",
      "https://paperboy.test/api/v1/suppressions/import",
      csv,
      "application/json",
    ),
    deps,
  );
  assert.equal(wrongType.status, 415);
  assert.equal((await wrongType.json()).error.code, "unsupported_media_type");
});

test("suppression REST errors are actionable without tenant leakage", async () => {
  const invalidJson = await handleCreateSuppressionRequest(
    request(
      "POST",
      "https://paperboy.test/api/v1/suppressions",
      "{bad-json",
    ),
    dependencies(),
  );
  const missing = await handleGetSuppressionRequest(
    request("GET", "https://paperboy.test/api/v1/suppressions/id"),
    suppression.id,
    dependencies({
      services: services({
        get: async () => {
          throw new SuppressionError("SUPPRESSION_NOT_FOUND");
        },
      }),
    }),
  );
  const forbidden = await handleCreateSuppressionRequest(
    request(
      "POST",
      "https://paperboy.test/api/v1/suppressions",
      JSON.stringify({ email: suppression.email }),
    ),
    dependencies({
      services: services({
        create: async () => {
          throw new AuthorizationError("suppressions.manage");
        },
      }),
    }),
  );
  const missingBody = await missing.json();

  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, "invalid_json");
  assert.equal(missing.status, 404);
  assert.equal(missingBody.error.code, "suppression_not_found");
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "forbidden");
  assert.equal(JSON.stringify(missingBody).includes(principal.orgId), false);
});

test("invalid bearer and oversized CSV fail before services run", async () => {
  let called = false;
  const deps = dependencies({
    services: services({
      import: async () => {
        called = true;
        return {};
      },
      list: async () => {
        called = true;
        return [];
      },
    }),
  });
  const unauthorized = await handleListSuppressionsRequest(
    new Request("https://paperboy.test/api/v1/suppressions", {
      headers: { Authorization: "Bearer invalid" },
    }),
    deps,
  );
  const oversized = new Request(
    "https://paperboy.test/api/v1/suppressions/import",
    {
      body: "email\n",
      headers: {
        Authorization: "Bearer valid",
        "Content-Length": String(MAX_SUPPRESSION_CSV_BYTES + 1),
        "Content-Type": "text/csv",
      },
      method: "POST",
    },
  );
  const oversizedResponse = await handleImportSuppressionsRequest(oversized, deps);

  assert.equal(unauthorized.status, 401);
  assert.match(unauthorized.headers.get("WWW-Authenticate"), /Bearer/);
  assert.equal(oversizedResponse.status, 413);
  assert.equal((await oversizedResponse.json()).error.code, "csv_too_large");
  assert.equal(called, false);
});
