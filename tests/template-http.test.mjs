import assert from "node:assert/strict";
import test from "node:test";
import { AuthorizationError } from "../src/lib/authorization.ts";
import { TemplateError } from "../src/lib/template-core.ts";
import {
  handleCreateTemplateRequest,
  handleDeleteTemplateRequest,
  handleGetTemplateRequest,
  handleListTemplatesRequest,
  handlePreviewTemplateRequest,
  handleUpdateTemplateRequest,
} from "../src/lib/template-http.ts";

const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "test",
  orgId: "11111111-1111-4111-8111-111111111111",
};
const fixedNow = new Date("2026-08-23T04:05:06.789Z");
const template = {
  createdAt: fixedNow,
  html: "<p>Hello {{reader.name}}</p>",
  id: "33333333-3333-4333-8333-333333333333",
  name: "Welcome",
  requiredVariables: ["reader.name"],
  subject: "Welcome, {{reader.name}}",
  text: "Hello {{reader.name}}",
  updatedAt: fixedNow,
};

function services(overrides = {}) {
  return {
    create: async () => template,
    delete: async () => undefined,
    get: async () => template,
    list: async () => [template],
    preview: async () => ({
      html: "<p>Hello </p>",
      missingVariables: ["reader.name"],
      subject: "Welcome, ",
      text: "Hello ",
    }),
    update: async () => template,
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

function request(method, body, authorization = "Bearer valid") {
  return new Request("https://paperboy.test/api/v1/templates", {
    body: body === undefined ? undefined : body,
    headers: {
      Authorization: authorization,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    method,
  });
}

test("template REST CRUD stays bound to the authenticated principal", async () => {
  const calls = [];
  const scoped = services({
    create: async (received, payload) => {
      calls.push(["create", received, payload]);
      return template;
    },
    delete: async (received, templateId) => {
      calls.push(["delete", received, templateId]);
    },
    get: async (received, templateId) => {
      calls.push(["get", received, templateId]);
      return template;
    },
    list: async (received) => {
      calls.push(["list", received]);
      return [template];
    },
    update: async (received, templateId, payload) => {
      calls.push(["update", received, templateId, payload]);
      return template;
    },
  });
  const deps = dependencies({ services: scoped });
  const createPayload = {
    name: "Welcome",
    subject: "Welcome, {{reader.name}}",
    text: "Hello {{reader.name}}",
  };
  const listResponse = await handleListTemplatesRequest(
    request("GET"),
    deps,
  );
  const createResponse = await handleCreateTemplateRequest(
    request("POST", JSON.stringify(createPayload)),
    deps,
  );
  const getResponse = await handleGetTemplateRequest(
    request("GET"),
    template.id,
    deps,
  );
  const updateResponse = await handleUpdateTemplateRequest(
    request("PATCH", JSON.stringify({ subject: "Updated" })),
    template.id,
    deps,
  );
  const deleteResponse = await handleDeleteTemplateRequest(
    request("DELETE"),
    template.id,
    deps,
  );

  assert.equal(listResponse.status, 200);
  assert.equal(createResponse.status, 201);
  assert.equal(getResponse.status, 200);
  assert.equal(updateResponse.status, 200);
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual((await listResponse.json()).data[0], {
    created_at: fixedNow.toISOString(),
    html: template.html,
    id: template.id,
    name: template.name,
    required_variables: template.requiredVariables,
    subject: template.subject,
    text: template.text,
    updated_at: fixedNow.toISOString(),
  });
  assert.deepEqual(await deleteResponse.json(), {
    deleted: true,
    id: template.id,
  });
  assert.deepEqual(calls, [
    ["list", principal],
    ["create", principal, createPayload],
    ["get", principal, template.id],
    ["update", principal, template.id, { subject: "Updated" }],
    ["delete", principal, template.id],
  ]);
});

test("preview returns rendered content and missing variables without mutation", async () => {
  const calls = [];
  const deps = dependencies({
    services: services({
      preview: async (received, templateId, data) => {
        calls.push({ data, received, templateId });
        return {
          html: "<p>Hello </p>",
          missingVariables: ["reader.name"],
          subject: "Welcome, ",
          text: "Hello ",
        };
      },
    }),
  });
  const response = await handlePreviewTemplateRequest(
    request("POST", JSON.stringify({ data: { publication: "Daily" } })),
    template.id,
    deps,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    html: "<p>Hello </p>",
    missing_variables: ["reader.name"],
    subject: "Welcome, ",
    template_id: template.id,
    text: "Hello ",
  });
  assert.deepEqual(calls, [
    {
      data: { publication: "Daily" },
      received: principal,
      templateId: template.id,
    },
  ]);
});

test("preview rejects unsupported envelope fields", async () => {
  let called = false;
  const response = await handlePreviewTemplateRequest(
    request("POST", JSON.stringify({ data: {}, send: true })),
    template.id,
    dependencies({
      services: services({
        preview: async () => {
          called = true;
          return {};
        },
      }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 422);
  assert.equal(body.error.code, "validation_error");
  assert.equal(body.error.fields[0].field, "send");
  assert.equal(called, false);
});

test("unknown templates return 404 without leaking another tenant", async () => {
  const deps = dependencies({
    services: services({
      get: async () => {
        throw new TemplateError("TEMPLATE_NOT_FOUND");
      },
    }),
  });
  const response = await handleGetTemplateRequest(
    request("GET"),
    "22222222-2222-4222-8222-222222222222",
    deps,
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "template_not_found");
  assert.equal(JSON.stringify(body).includes(principal.orgId), false);
});

test("invalid JSON, missing membership, and insufficient role are explicit", async () => {
  const invalidJson = await handleCreateTemplateRequest(
    request("POST", "{bad-json"),
    dependencies(),
  );
  const noMembership = await handleListTemplatesRequest(
    request("GET"),
    dependencies({
      services: services({
        list: async () => {
          throw new TemplateError("MEMBERSHIP_REQUIRED");
        },
      }),
    }),
  );
  const forbidden = await handleCreateTemplateRequest(
    request("POST", "{}"),
    dependencies({
      services: services({
        create: async () => {
          throw new AuthorizationError("templates.create");
        },
      }),
    }),
  );

  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error.code, "invalid_json");
  assert.equal(noMembership.status, 403);
  assert.equal((await noMembership.json()).error.code, "membership_required");
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "forbidden");
});

test("invalid bearer keys fail before template services run", async () => {
  let called = false;
  const response = await handleListTemplatesRequest(
    request("GET", undefined, "Bearer invalid"),
    dependencies({
      services: services({
        list: async () => {
          called = true;
          return [];
        },
      }),
    }),
  );

  assert.equal(response.status, 401);
  assert.match(response.headers.get("WWW-Authenticate"), /Bearer/);
  assert.equal(called, false);
});
