import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  DNS_OPERATOR_GUIDE,
} from "../src/lib/dns-operator-guide.ts";
import { EmailError } from "../src/lib/email-core.ts";
import {
  PAPERBOY_MCP_RESOURCE_URIS,
  PAPERBOY_MCP_SCHEMA_VERSION,
  PAPERBOY_MCP_TOOL_NAMES,
  createPaperBoyMcpServer,
} from "../src/mcp/server.ts";

const fixedNow = new Date("2026-08-23T01:02:03.456Z");
const firstOrganization = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "First newsroom",
};
const secondOrganization = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Second newsroom",
};
const firstPrincipal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: firstOrganization.id,
};
const firstDomain = {
  createdAt: fixedNow,
  dkimKeys: [
    {
      activatedAt: null,
      createdAt: fixedNow,
      dnsStatus: "unchecked",
      id: "55555555-5555-4555-8555-555555555555",
      lastCheckedAt: null,
      publicKey: "public-key-only",
      retiredAt: null,
      selector: "pb20260823a1b2c3d4",
      status: "pending",
      updatedAt: fixedNow,
    },
  ],
  dnsChecks: {
    dkim: "pending",
    dmarc: "unchecked",
    ownership: "unchecked",
    spf: "unchecked",
  },
  id: "33333333-3333-4333-8333-333333333333",
  lastCheckedAt: null,
  name: "mail.example.com",
  status: "pending",
  updatedAt: fixedNow,
  verificationToken: "44444444-4444-4444-8444-444444444444",
  verifiedAt: null,
};
const firstMessage = {
  createdAt: fixedNow,
  deliveryMode: "test-sink",
  domainId: null,
  environment: "test",
  id: "66666666-6666-4666-8666-666666666666",
  replayed: false,
  status: "queued",
};

function domainServices(overrides = {}) {
  return {
    create: async () => firstDomain,
    delete: async () => undefined,
    finalizeDkimRotation: async () => firstDomain,
    list: async () => [firstDomain],
    records: () => [],
    rotateDkim: async () => firstDomain,
    setupDkim: async () => firstDomain,
    verify: async () => firstDomain,
    ...overrides,
  };
}

function emailServices(overrides = {}) {
  return {
    queue: async () => firstMessage,
    queueBatch: async () => [{ message: firstMessage, ok: true }],
    ...overrides,
  };
}

async function withClient(dependencies, run) {
  const server = createPaperBoyMcpServer({
    now: () => fixedNow,
    ...dependencies,
  });
  const client = new Client({ name: "paperboy-test", version: "1.0.0" });
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  try {
    await run(client);
  } finally {
    await Promise.allSettled([client.close(), server.close()]);
  }
}

function dependencies(overrides = {}) {
  return {
    authorize: async () => firstPrincipal,
    domains: domainServices(),
    emails: emailServices(),
    findOrganization: async (orgId) =>
      orgId === firstOrganization.id ? firstOrganization : null,
    ...overrides,
  };
}

test("initializes and publishes versioned tool schemas", async () => {
  await withClient(dependencies(), async (client) => {
    const { tools } = await client.listTools();
    const outputSchemaSnapshots = {
      paperboy_create_domain: [
        "domain",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_delete_domain: [
        "deleted",
        "domainId",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_finalize_domain_dkim_rotation: [
        "domain",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_get_account_context: [
        "credential",
        "observedAt",
        "organization",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_list_capabilities: [
        "generatedAt",
        "protocolTimeZone",
        "resources",
        "schemaVersion",
        "tools",
        "transports",
      ],
      paperboy_list_domains: [
        "domains",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_send_email: [
        "deliveryMode",
        "environment",
        "id",
        "protocolTimeZone",
        "queuedAt",
        "replayed",
        "schemaVersion",
        "status",
      ],
      paperboy_send_email_batch: [
        "data",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_rotate_domain_dkim: [
        "domain",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_setup_domain_dkim: [
        "domain",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_verify_domain: [
        "domain",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
    };
    const inputSchemaSnapshots = {
      paperboy_create_domain: ["name"],
      paperboy_delete_domain: ["confirm", "domainId"],
      paperboy_finalize_domain_dkim_rotation: ["confirm", "domainId"],
      paperboy_get_account_context: [],
      paperboy_list_capabilities: [],
      paperboy_list_domains: [],
      paperboy_rotate_domain_dkim: ["domainId"],
      paperboy_send_email: [
        "attachments",
        "from",
        "html",
        "idempotencyKey",
        "subject",
        "tags",
        "text",
        "to",
      ],
      paperboy_send_email_batch: ["emails"],
      paperboy_setup_domain_dkim: ["domainId"],
      paperboy_verify_domain: ["domainId"],
    };
    const requiredInputSchemaSnapshots = {
      paperboy_send_email: ["from", "subject", "to"],
    };
    const annotationSnapshots = {
      paperboy_create_domain: { destructive: false, readOnly: false },
      paperboy_delete_domain: { destructive: true, readOnly: false },
      paperboy_finalize_domain_dkim_rotation: {
        destructive: true,
        readOnly: false,
      },
      paperboy_get_account_context: { destructive: false, readOnly: true },
      paperboy_list_capabilities: { destructive: false, readOnly: true },
      paperboy_list_domains: { destructive: false, readOnly: true },
      paperboy_rotate_domain_dkim: { destructive: false, readOnly: false },
      paperboy_send_email: { destructive: false, readOnly: false },
      paperboy_send_email_batch: { destructive: false, readOnly: false },
      paperboy_setup_domain_dkim: { destructive: false, readOnly: false },
      paperboy_verify_domain: { destructive: false, readOnly: false },
    };

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [...PAPERBOY_MCP_TOOL_NAMES],
    );

    for (const tool of tools) {
      assert.equal(
        tool.inputSchema.$schema,
        "https://json-schema.org/draft/2020-12/schema",
      );
      assert.equal(tool.inputSchema.additionalProperties, false);
      assert.equal(tool.inputSchema.type, "object");
      assert.deepEqual(
        Object.keys(tool.inputSchema.properties),
        inputSchemaSnapshots[tool.name],
      );
      assert.deepEqual(
        tool.inputSchema.required ?? [],
        requiredInputSchemaSnapshots[tool.name] ??
          inputSchemaSnapshots[tool.name],
      );
      assert.equal(
        tool._meta?.["paperboy/schemaVersion"],
        PAPERBOY_MCP_SCHEMA_VERSION,
      );
      assert.equal(
        tool.annotations?.readOnlyHint,
        annotationSnapshots[tool.name].readOnly,
      );
      assert.equal(
        tool.annotations?.destructiveHint,
        annotationSnapshots[tool.name].destructive,
      );
      assert.equal(tool.outputSchema?.type, "object");
      assert.deepEqual(
        Object.keys(tool.outputSchema.properties),
        outputSchemaSnapshots[tool.name],
      );
      assert.deepEqual(
        tool.outputSchema.required,
        outputSchemaSnapshots[tool.name],
      );
      assert.equal(
        tool.outputSchema.properties.schemaVersion.const,
        PAPERBOY_MCP_SCHEMA_VERSION,
      );
    }
  });
});

test("returns only the organization bound to the API key", async () => {
  const lookups = [];

  await withClient(
    dependencies({
      findOrganization: async (orgId) => {
        lookups.push(orgId);
        return orgId === firstOrganization.id
          ? firstOrganization
          : secondOrganization;
      },
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: {},
        name: "paperboy_get_account_context",
      });

      assert.equal(result.isError, undefined);
      assert.deepEqual(result.structuredContent, {
        credential: { environment: "live" },
        observedAt: "2026-08-23T01:02:03.456Z",
        organization: firstOrganization,
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
      });
      assert.deepEqual(lookups, [firstOrganization.id]);
      assert.equal(JSON.stringify(result).includes(secondOrganization.id), false);
    },
  );
});

test("discovers transports, tools, and authenticated documentation", async () => {
  await withClient(dependencies(), async (client) => {
    const capabilities = await client.callTool({
      arguments: {},
      name: "paperboy_list_capabilities",
    });

    assert.deepEqual(capabilities.structuredContent.transports, [
      "streamable-http",
      "stdio",
    ]);
    assert.equal(capabilities.structuredContent.protocolTimeZone, "UTC");
    assert.equal(capabilities.structuredContent.generatedAt, fixedNow.toISOString());

    const { resources } = await client.listResources();
    assert.deepEqual(
      resources.map((resource) => resource.uri),
      [...PAPERBOY_MCP_RESOURCE_URIS],
    );

    const configuration = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[0],
    });
    assert.match(configuration.contents[0].text, /Streamable HTTP/);
    assert.match(configuration.contents[0].text, /Revocation denies/);

    const dnsGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[2],
    });
    assert.equal(dnsGuide.contents[0].text, DNS_OPERATOR_GUIDE);
    assert.match(dnsGuide.contents[0].text, /Cloudflare Email Sending/);
  });
});

test("a revoked stdio principal cannot call tenant tools", async () => {
  let revoked = false;

  await withClient(
    dependencies({
      authorize: async () => (revoked ? null : firstPrincipal),
    }),
    async (client) => {
      revoked = true;
      const result = await client.callTool({
        arguments: {},
        name: "paperboy_get_account_context",
      });

      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /Authorization failed/);
      assert.equal(JSON.stringify(result).includes(firstOrganization.id), false);
    },
  );
});

test("domain tools pass the authenticated tenant and actor to shared services", async () => {
  let received = null;

  await withClient(
    dependencies({
      domains: domainServices({
        create: async (principal, name) => {
          received = { name, principal };
          return firstDomain;
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: { name: "mail.example.com" },
        name: "paperboy_create_domain",
      });

      assert.equal(result.isError, undefined);
      assert.equal(result.structuredContent.domain.name, firstDomain.name);
      assert.equal(result.structuredContent.protocolTimeZone, "UTC");
      assert.equal(
        result.structuredContent.domain.dkimKeys[0].dnsName,
        "pb20260823a1b2c3d4._domainkey.mail.example.com",
      );
      assert.equal(JSON.stringify(result).includes("private"), false);
      assert.deepEqual(received, {
        name: "mail.example.com",
        principal: firstPrincipal,
      });
    },
  );
});

test("sending is a first-class tenant-bound MCP operation with UTC metadata", async () => {
  let received = null;

  await withClient(
    dependencies({
      emails: emailServices({
        queue: async (principal, payload, idempotencyKey) => {
          received = { idempotencyKey, payload, principal };
          return firstMessage;
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: {
          attachments: [
            {
              content: "cHJpdmF0ZQ==",
              content_type: "text/plain",
              filename: "private.txt",
            },
          ],
          from: "sender@example.com",
          idempotencyKey: "message-123",
          subject: "Hello",
          tags: [{ name: "kind", value: "receipt" }],
          text: "Body",
          to: ["reader@example.net"],
        },
        name: "paperboy_send_email",
      });

      assert.equal(result.isError, undefined);
      assert.deepEqual(received, {
        idempotencyKey: "message-123",
        payload: {
          attachments: [
            {
              content: "cHJpdmF0ZQ==",
              content_type: "text/plain",
              filename: "private.txt",
            },
          ],
          from: "sender@example.com",
          subject: "Hello",
          tags: [{ name: "kind", value: "receipt" }],
          text: "Body",
          to: ["reader@example.net"],
        },
        principal: firstPrincipal,
      });
      assert.deepEqual(result.structuredContent, {
        deliveryMode: "test-sink",
        environment: "test",
        id: firstMessage.id,
        protocolTimeZone: "UTC",
        queuedAt: fixedNow.toISOString(),
        replayed: false,
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        status: "queued",
      });
      assert.equal(JSON.stringify(result).includes("Body"), false);
      assert.equal(JSON.stringify(result).includes("cHJpdmF0ZQ=="), false);
    },
  );
});

test("batch sending preserves order and reports per-item MCP failures", async () => {
  let received = null;
  const secondMessage = {
    ...firstMessage,
    id: "77777777-7777-4777-8777-777777777777",
  };
  const emails = [
    {
      from: "sender@example.com",
      subject: "First",
      text: "First body",
      to: ["first@example.net"],
    },
    {
      from: "sender@example.com",
      subject: "Second",
      text: "Second body",
      to: ["second@example.net"],
    },
  ];

  await withClient(
    dependencies({
      emails: emailServices({
        queueBatch: async (principal, payloads) => {
          received = { payloads, principal };
          return [
            { message: secondMessage, ok: true },
            {
              error: new EmailError("VALIDATION_ERROR", [
                { field: "to", message: "Recipient denied." },
              ]),
              ok: false,
            },
          ];
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: { emails },
        name: "paperboy_send_email_batch",
      });

      assert.equal(result.isError, undefined);
      assert.deepEqual(received, { payloads: emails, principal: firstPrincipal });
      assert.deepEqual(result.structuredContent, {
        data: [
          {
            deliveryMode: "test-sink",
            environment: "test",
            id: secondMessage.id,
            index: 0,
            queuedAt: fixedNow.toISOString(),
            replayed: false,
            status: "queued",
          },
          {
            error: {
              code: "validation_error",
              fields: [{ field: "to", message: "Recipient denied." }],
              message: "Correct the invalid email fields and try again.",
            },
            index: 1,
          },
        ],
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
      });
      assert.equal(JSON.stringify(result).includes("First body"), false);
      assert.equal(JSON.stringify(result).includes("Second body"), false);
    },
  );
});

test("DKIM rotation is a first-class tenant-bound MCP operation", async () => {
  let received = null;

  await withClient(
    dependencies({
      domains: domainServices({
        rotateDkim: async (principal, domainId) => {
          received = { domainId, principal };
          return firstDomain;
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: { domainId: firstDomain.id },
        name: "paperboy_rotate_domain_dkim",
      });

      assert.equal(result.isError, undefined);
      assert.deepEqual(received, {
        domainId: firstDomain.id,
        principal: firstPrincipal,
      });
      assert.equal(result.structuredContent.protocolTimeZone, "UTC");
      assert.equal(JSON.stringify(result).includes("encryptedPrivateKey"), false);
    },
  );
});
