import assert from "node:assert/strict";
import test from "node:test";
import { BroadcastError } from "../src/lib/broadcast-core.ts";
import {
  handleCancelBroadcastRequest,
  handleCreateBroadcastRequest,
  handleGetBroadcastRequest,
  handleListBroadcastsRequest,
  handlePauseBroadcastRequest,
  handleResumeBroadcastRequest,
  handleUpdateBroadcastRequest,
} from "../src/lib/broadcast-http.ts";

const fixedNow = new Date("2026-08-23T03:04:05.678Z");
const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "test",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const record = {
  cancelledAt: null,
  completedAt: fixedNow,
  createdAt: fixedNow,
  environment: "test",
  from: "news@example.com",
  id: "99999999-9999-4999-8999-999999999999",
  name: "Morning edition",
  pausedAt: null,
  progress: {
    cancelled: 0,
    failed: 0,
    pending: 0,
    processing: 0,
    queued: 18,
    suppressed: 2,
    total: 20,
  },
  scheduledFor: null,
  sourceAudienceId: "77777777-7777-4777-8777-777777777777",
  sourceTemplateId: "88888888-8888-4888-8888-888888888888",
  status: "completed",
  templateName: "Welcome reader",
  updatedAt: fixedNow,
};

function request(method, body) {
  return new Request("http://paperboy.test/api/v1/broadcasts", {
    body,
    headers: { Authorization: "Bearer test", "Content-Type": "application/json" },
    method,
  });
}

function services(overrides = {}) {
  return {
    cancel: async () => record,
    create: async () => record,
    get: async () => record,
    list: async () => [record],
    pause: async () => record,
    resume: async () => record,
    update: async () => record,
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    authenticate: async () => principal,
    services: services(),
    ...overrides,
  };
}

test("broadcast REST create is tenant-bound and returns UTC progress", async () => {
  let received = null;
  const payload = {
    audience_id: record.sourceAudienceId,
    from: "news@example.com",
    name: "Morning edition",
    template_id: record.sourceTemplateId,
  };
  const response = await handleCreateBroadcastRequest(
    request("POST", JSON.stringify(payload)),
    dependencies({
      services: services({
        create: async (receivedPrincipal, receivedPayload) => {
          received = { receivedPayload, receivedPrincipal };
          return record;
        },
      }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.deepEqual(received, {
    receivedPayload: payload,
    receivedPrincipal: principal,
  });
  assert.equal(body.data.created_at, fixedNow.toISOString());
  assert.equal(body.data.completed_at, fixedNow.toISOString());
  assert.equal(body.data.progress.suppressed, 2);
  assert.equal(body.data.source_audience_id, record.sourceAudienceId);
  assert.equal(body.data.scheduled_at, null);
});

test("broadcast REST list, get, and controls share one authenticated service", async () => {
  const calls = [];
  const deps = dependencies({
    services: services({
      cancel: async (received, id) => {
        calls.push(["cancel", received, id]);
        return record;
      },
      get: async (received, id) => {
        calls.push(["get", received, id]);
        return record;
      },
      list: async (received) => {
        calls.push(["list", received]);
        return [record];
      },
      pause: async (received, id) => {
        calls.push(["pause", received, id]);
        return record;
      },
      resume: async (received, id) => {
        calls.push(["resume", received, id]);
        return record;
      },
      update: async (received, id, payload) => {
        calls.push(["update", received, id, payload]);
        return record;
      },
    }),
  });

  const responses = await Promise.all([
    handleListBroadcastsRequest(request("GET"), deps),
    handleGetBroadcastRequest(request("GET"), record.id, deps),
    handlePauseBroadcastRequest(request("POST"), record.id, deps),
    handleResumeBroadcastRequest(request("POST"), record.id, deps),
    handleCancelBroadcastRequest(request("POST"), record.id, deps),
    handleUpdateBroadcastRequest(
      request("PATCH", JSON.stringify({ scheduled_for: "2026-09-24T22:00:00.000Z" })),
      record.id,
      deps,
    ),
  ]);

  assert.deepEqual(
    responses.map((response) => response.status),
    [200, 200, 200, 200, 200, 200],
  );
  assert.deepEqual(calls, [
    ["list", principal],
    ["get", principal, record.id],
    ["pause", principal, record.id],
    ["resume", principal, record.id],
    ["cancel", principal, record.id],
    [
      "update",
      principal,
      record.id,
      { scheduled_for: "2026-09-24T22:00:00.000Z" },
    ],
  ]);
});

test("broadcast REST hides cross-tenant records and rejects unauthenticated requests", async () => {
  const hidden = await handleGetBroadcastRequest(
    request("GET"),
    record.id,
    dependencies({
      services: services({
        get: async () => {
          throw new BroadcastError("BROADCAST_NOT_FOUND");
        },
      }),
    }),
  );
  const unauthorized = await handleListBroadcastsRequest(
    request("GET"),
    dependencies({ authenticate: async () => null }),
  );

  assert.equal(hidden.status, 404);
  assert.equal((await hidden.json()).error.code, "broadcast_not_found");
  assert.equal(unauthorized.status, 401);
});
