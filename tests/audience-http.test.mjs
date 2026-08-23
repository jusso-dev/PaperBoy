import assert from "node:assert/strict";
import test from "node:test";
import { AudienceError } from "../src/lib/audience-core.ts";
import {
  handleCreateAudienceRequest,
  handleCreateContactRequest,
  handleDeleteAudienceRequest,
  handleDeleteContactRequest,
  handleGetAudienceRequest,
  handleGetContactRequest,
  handleImportContactsRequest,
  handleListAudiencesRequest,
  handleListContactsRequest,
  handleUpdateAudienceRequest,
  handleUpdateContactRequest,
} from "../src/lib/audience-http.ts";

const fixedNow = new Date("2026-08-24T08:09:10.111Z");
const audience = {
  activeContactCount: 1,
  contactCount: 1,
  createdAt: fixedNow,
  id: "22222222-2222-4222-8222-222222222222",
  name: "Weekly readers",
  updatedAt: fixedNow,
};
const contact = {
  audienceId: audience.id,
  createdAt: fixedNow,
  email: "reader@example.net",
  id: "33333333-3333-4333-8333-333333333333",
  name: "Ada",
  unsubscribedAt: null,
  updatedAt: fixedNow,
};
const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: "11111111-1111-4111-8111-111111111111",
};

function services(overrides = {}) {
  return {
    createAudience: async () => audience,
    createContact: async () => contact,
    deleteAudience: async () => undefined,
    deleteContact: async () => undefined,
    getAudience: async () => audience,
    getContact: async () => contact,
    importContacts: async () => ({
      created: 1,
      importedAt: fixedNow,
      inputRows: 2,
      unchanged: 1,
      uniqueRows: 2,
      updated: 0,
    }),
    listAudiences: async () => [audience],
    listContacts: async () => [contact],
    updateAudience: async () => audience,
    updateContact: async () => contact,
    ...overrides,
  };
}

function dependencies(overrides = {}) {
  return {
    authenticate: async (request) =>
      request.headers.get("authorization") === "Bearer valid" ? principal : null,
    services: services(),
    ...overrides,
  };
}

function request(method, path, body, contentType = "application/json") {
  return new Request(`https://paperboy.test${path}`, {
    body,
    headers: {
      Authorization: "Bearer valid",
      ...(body === undefined ? {} : { "Content-Type": contentType }),
    },
    method,
  });
}

test("audience and contact REST operations stay bound to the authenticated tenant", async () => {
  const calls = [];
  const scoped = services({
    createAudience: async (received, payload) => { calls.push(["createAudience", received, payload]); return audience; },
    createContact: async (received, audienceId, payload) => { calls.push(["createContact", received, audienceId, payload]); return contact; },
    deleteAudience: async (received, audienceId) => { calls.push(["deleteAudience", received, audienceId]); },
    deleteContact: async (received, audienceId, contactId) => { calls.push(["deleteContact", received, audienceId, contactId]); },
    getAudience: async (received, audienceId) => { calls.push(["getAudience", received, audienceId]); return audience; },
    getContact: async (received, audienceId, contactId) => { calls.push(["getContact", received, audienceId, contactId]); return contact; },
    listAudiences: async (received) => { calls.push(["listAudiences", received]); return [audience]; },
    listContacts: async (received, audienceId) => { calls.push(["listContacts", received, audienceId]); return [contact]; },
    updateAudience: async (received, audienceId, payload) => { calls.push(["updateAudience", received, audienceId, payload]); return audience; },
    updateContact: async (received, audienceId, contactId, payload) => { calls.push(["updateContact", received, audienceId, contactId, payload]); return contact; },
  });
  const deps = dependencies({ services: scoped });
  const responses = await Promise.all([
    handleListAudiencesRequest(request("GET", "/api/v1/audiences"), deps),
    handleCreateAudienceRequest(request("POST", "/api/v1/audiences", JSON.stringify({ name: audience.name })), deps),
    handleGetAudienceRequest(request("GET", "/api/v1/audiences/id"), audience.id, deps),
    handleUpdateAudienceRequest(request("PATCH", "/api/v1/audiences/id", JSON.stringify({ name: audience.name })), audience.id, deps),
    handleDeleteAudienceRequest(request("DELETE", "/api/v1/audiences/id"), audience.id, deps),
    handleListContactsRequest(request("GET", "/api/v1/audiences/id/contacts"), audience.id, deps),
    handleCreateContactRequest(request("POST", "/api/v1/audiences/id/contacts", JSON.stringify({ email: contact.email, name: contact.name })), audience.id, deps),
    handleGetContactRequest(request("GET", "/api/v1/audiences/id/contacts/id"), audience.id, contact.id, deps),
    handleUpdateContactRequest(request("PATCH", "/api/v1/audiences/id/contacts/id", JSON.stringify({ name: "Ada" })), audience.id, contact.id, deps),
    handleDeleteContactRequest(request("DELETE", "/api/v1/audiences/id/contacts/id"), audience.id, contact.id, deps),
  ]);

  assert.deepEqual(responses.map((response) => response.status), [200, 201, 200, 200, 200, 200, 201, 200, 200, 200]);
  assert.equal((await responses[0].json()).protocol_time_zone, "UTC");
  assert.deepEqual(await responses[7].json(), {
    audience_id: audience.id,
    created_at: fixedNow.toISOString(),
    email: contact.email,
    id: contact.id,
    name: contact.name,
    unsubscribed_at: null,
    updated_at: fixedNow.toISOString(),
  });
  assert.equal(calls.every((call) => call[1] === principal), true);
  assert.equal(JSON.stringify(calls).includes("org_id"), false);
});

test("contact CSV import is content-typed, bounded, and reports UTC counts", async () => {
  const csv = "email,name\nreader@example.net,Ada\nother@example.net,Grace\n";
  let received = null;
  const response = await handleImportContactsRequest(
    request("POST", `/api/v1/audiences/${audience.id}/contacts/import`, csv, "text/csv; charset=utf-8"),
    audience.id,
    dependencies({
      services: services({
        importContacts: async (...args) => { received = args; return services().importContacts(); },
      }),
    }),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(received, [principal, audience.id, csv]);
  assert.equal((await response.json()).imported_at, fixedNow.toISOString());

  const wrongType = await handleImportContactsRequest(
    request("POST", "/api/v1/audiences/id/contacts/import", csv, "application/json"),
    audience.id,
    dependencies(),
  );
  assert.equal(wrongType.status, 415);
});

test("audience REST hides cross-tenant records and rejects invalid bearer tokens", async () => {
  const hidden = await handleGetAudienceRequest(
    request("GET", "/api/v1/audiences/id"),
    audience.id,
    dependencies({ services: services({ getAudience: async () => { throw new AudienceError("AUDIENCE_NOT_FOUND"); } }) }),
  );
  const unauthorized = await handleListAudiencesRequest(
    new Request("https://paperboy.test/api/v1/audiences", { headers: { Authorization: "Bearer invalid" } }),
    dependencies(),
  );
  assert.equal(hidden.status, 404);
  assert.equal((await hidden.json()).error.code, "audience_not_found");
  assert.equal(unauthorized.status, 401);
});
