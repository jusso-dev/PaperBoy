import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
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
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId: firstOrganization.id,
};

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
    findOrganization: async (orgId) =>
      orgId === firstOrganization.id ? firstOrganization : null,
    ...overrides,
  };
}

test("initializes and publishes versioned tool schemas", async () => {
  await withClient(dependencies(), async (client) => {
    const { tools } = await client.listTools();
    const outputSchemaSnapshots = {
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
    };

    assert.deepEqual(
      tools.map((tool) => tool.name),
      [...PAPERBOY_MCP_TOOL_NAMES],
    );

    for (const tool of tools) {
      assert.deepEqual(tool.inputSchema, {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        additionalProperties: false,
        properties: {},
        type: "object",
      });
      assert.equal(
        tool._meta?.["paperboy/schemaVersion"],
        PAPERBOY_MCP_SCHEMA_VERSION,
      );
      assert.equal(tool.annotations?.readOnlyHint, true);
      assert.equal(tool.annotations?.destructiveHint, false);
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
