import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  DNS_OPERATOR_GUIDE,
} from "../src/lib/dns-operator-guide.ts";
import { EmailError } from "../src/lib/email-core.ts";
import { TemplateError } from "../src/lib/template-core.ts";
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
const firstDelivery = {
  attemptCount: 2,
  createdAt: fixedNow,
  deliveryMode: "test-sink",
  environment: "test",
  failedAt: null,
  failureReason: "Outbound HTTP provider returned 503.",
  id: firstMessage.id,
  lastAttemptAt: fixedNow,
  lastErrorCode: "http_503",
  leaseExpiresAt: null,
  nextAttemptAt: fixedNow,
  sentAt: null,
  status: "queued",
  updatedAt: fixedNow,
};
const firstEvent = {
  createdAt: fixedNow,
  data: { provider: "private-provider", recipient: "reader@example.net" },
  id: "77777777-7777-4777-8777-777777777777",
  messageId: firstMessage.id,
  sequence: 1,
  type: "queued",
};
const firstWebhook = {
  createdAt: fixedNow,
  id: "abababab-abab-4bab-8bab-abababababab",
  updatedAt: fixedNow,
  url: "https://hooks.example.com/paperboy",
};
const firstFeedback = {
  classification: "hard_bounce",
  createdAt: fixedNow,
  eventId: "cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd",
  messageId: firstMessage.id,
  replayed: false,
  suppressed: true,
};
const firstTemplate = {
  createdAt: fixedNow,
  html: "<p>Hello {{reader.name}}</p>",
  id: "88888888-8888-4888-8888-888888888888",
  name: "Welcome reader",
  requiredVariables: ["reader.name"],
  subject: "Welcome, {{reader.name}}",
  text: "Hello {{reader.name}}",
  updatedAt: fixedNow,
};
const firstBroadcast = {
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
    failed: 1,
    pending: 0,
    processing: 0,
    queued: 17,
    suppressed: 2,
    total: 20,
  },
  sourceTemplateId: firstTemplate.id,
  status: "completed",
  templateName: firstTemplate.name,
  updatedAt: fixedNow,
};

function broadcastServices(overrides = {}) {
  return {
    cancel: async () => firstBroadcast,
    create: async () => firstBroadcast,
    get: async () => firstBroadcast,
    list: async () => [firstBroadcast],
    pause: async () => firstBroadcast,
    resume: async () => firstBroadcast,
    ...overrides,
  };
}

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

function deliveryServices(overrides = {}) {
  return {
    get: async () => firstDelivery,
    list: async () => [firstDelivery],
    listEvents: async () => [firstEvent],
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

function feedbackServices(overrides = {}) {
  return {
    ingest: async () => [firstFeedback],
    ...overrides,
  };
}

function templateServices(overrides = {}) {
  return {
    create: async () => firstTemplate,
    delete: async () => undefined,
    get: async () => firstTemplate,
    list: async () => [firstTemplate],
    preview: async () => ({
      html: "<p>Hello </p>",
      missingVariables: ["reader.name"],
      subject: "Welcome, ",
      text: "Hello ",
    }),
    update: async () => firstTemplate,
    ...overrides,
  };
}

function webhookServices(overrides = {}) {
  return {
    configure: async () => ({
      endpoint: firstWebhook,
      signingSecret: "whsec_shown-once",
    }),
    get: async () => firstWebhook,
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
    broadcasts: broadcastServices(),
    deliveries: deliveryServices(),
    domains: domainServices(),
    emails: emailServices(),
    feedback: feedbackServices(),
    findOrganization: async (orgId) =>
      orgId === firstOrganization.id ? firstOrganization : null,
    templates: templateServices(),
    webhooks: webhookServices(),
    ...overrides,
  };
}

test("initializes and publishes versioned tool schemas", async () => {
  await withClient(dependencies(), async (client) => {
    const { tools } = await client.listTools();
    const outputSchemaSnapshots = {
      paperboy_cancel_broadcast: [
        "broadcast",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_create_broadcast: [
        "broadcast",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_create_domain: [
        "domain",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_create_template: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "template",
      ],
      paperboy_delete_domain: [
        "deleted",
        "domainId",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_delete_template: [
        "deleted",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "templateId",
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
      paperboy_get_broadcast: [
        "broadcast",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_get_delivery_status: [
        "delivery",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_get_template: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "template",
      ],
      paperboy_get_webhook: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "webhook",
      ],
      paperboy_ingest_feedback: [
        "data",
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
      paperboy_list_broadcasts: [
        "broadcasts",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_list_domains: [
        "domains",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_list_delivery_statuses: [
        "deliveries",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_list_message_events: [
        "events",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_list_templates: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "templates",
      ],
      paperboy_configure_webhook: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "signingSecret",
        "webhook",
      ],
      paperboy_preview_template: [
        "html",
        "missingVariables",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "subject",
        "templateId",
        "text",
      ],
      paperboy_pause_broadcast: [
        "broadcast",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_resume_broadcast: [
        "broadcast",
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
      paperboy_update_template: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "template",
      ],
      paperboy_verify_domain: [
        "domain",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
      ],
    };
    const inputSchemaSnapshots = {
      paperboy_cancel_broadcast: ["broadcastId", "confirm"],
      paperboy_create_broadcast: ["audience", "from", "name", "templateId"],
      paperboy_create_domain: ["name"],
      paperboy_create_template: [
        "html",
        "name",
        "requiredVariables",
        "subject",
        "text",
      ],
      paperboy_delete_domain: ["confirm", "domainId"],
      paperboy_delete_template: ["confirm", "templateId"],
      paperboy_finalize_domain_dkim_rotation: ["confirm", "domainId"],
      paperboy_get_account_context: [],
      paperboy_get_broadcast: ["broadcastId"],
      paperboy_get_delivery_status: ["messageId"],
      paperboy_get_template: ["templateId"],
      paperboy_get_webhook: [],
      paperboy_ingest_feedback: ["rawReportBase64"],
      paperboy_list_capabilities: [],
      paperboy_list_broadcasts: [],
      paperboy_list_domains: [],
      paperboy_list_delivery_statuses: ["limit"],
      paperboy_list_message_events: ["messageId"],
      paperboy_list_templates: [],
      paperboy_configure_webhook: ["url"],
      paperboy_preview_template: ["data", "templateId"],
      paperboy_pause_broadcast: ["broadcastId"],
      paperboy_resume_broadcast: ["broadcastId"],
      paperboy_rotate_domain_dkim: ["domainId"],
      paperboy_send_email: [
        "attachments",
        "data",
        "from",
        "html",
        "idempotencyKey",
        "subject",
        "tags",
        "template_id",
        "text",
        "to",
      ],
      paperboy_send_email_batch: ["emails"],
      paperboy_setup_domain_dkim: ["domainId"],
      paperboy_update_template: [
        "html",
        "name",
        "requiredVariables",
        "subject",
        "templateId",
        "text",
      ],
      paperboy_verify_domain: ["domainId"],
    };
    const requiredInputSchemaSnapshots = {
      paperboy_create_broadcast: ["audience", "from", "name", "templateId"],
      paperboy_create_template: ["name", "subject"],
      paperboy_ingest_feedback: ["rawReportBase64"],
      paperboy_list_delivery_statuses: [],
      paperboy_send_email: ["from", "to"],
      paperboy_update_template: ["templateId"],
    };
    const annotationSnapshots = {
      paperboy_cancel_broadcast: { destructive: true, readOnly: false },
      paperboy_create_broadcast: { destructive: false, readOnly: false },
      paperboy_create_domain: { destructive: false, readOnly: false },
      paperboy_create_template: { destructive: false, readOnly: false },
      paperboy_delete_domain: { destructive: true, readOnly: false },
      paperboy_delete_template: { destructive: true, readOnly: false },
      paperboy_finalize_domain_dkim_rotation: {
        destructive: true,
        readOnly: false,
      },
      paperboy_get_account_context: { destructive: false, readOnly: true },
      paperboy_get_broadcast: { destructive: false, readOnly: true },
      paperboy_get_delivery_status: { destructive: false, readOnly: true },
      paperboy_get_template: { destructive: false, readOnly: true },
      paperboy_get_webhook: { destructive: false, readOnly: true },
      paperboy_ingest_feedback: { destructive: false, readOnly: false },
      paperboy_list_capabilities: { destructive: false, readOnly: true },
      paperboy_list_broadcasts: { destructive: false, readOnly: true },
      paperboy_list_domains: { destructive: false, readOnly: true },
      paperboy_list_delivery_statuses: { destructive: false, readOnly: true },
      paperboy_list_message_events: { destructive: false, readOnly: true },
      paperboy_list_templates: { destructive: false, readOnly: true },
      paperboy_configure_webhook: { destructive: false, readOnly: false },
      paperboy_preview_template: { destructive: false, readOnly: true },
      paperboy_pause_broadcast: { destructive: false, readOnly: false },
      paperboy_resume_broadcast: { destructive: false, readOnly: false },
      paperboy_rotate_domain_dkim: { destructive: false, readOnly: false },
      paperboy_send_email: { destructive: false, readOnly: false },
      paperboy_send_email_batch: { destructive: false, readOnly: false },
      paperboy_setup_domain_dkim: { destructive: false, readOnly: false },
      paperboy_update_template: { destructive: false, readOnly: false },
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

    const templateGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[3],
    });
    assert.match(templateGuide.contents[0].text, /{{reader\.name}}/);
    assert.match(templateGuide.contents[0].text, /Cloudflare|provider delivery/);

    const broadcastGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[4],
    });
    assert.match(broadcastGuide.contents[0].text, /suppression/);
    assert.match(broadcastGuide.contents[0].text, /open-tracking pixel/);

    const workerGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[5],
    });
    assert.match(workerGuide.contents[0].text, /five-minute lease/);
    assert.match(workerGuide.contents[0].text, /SMTP_URL/);
    assert.match(workerGuide.contents[0].text, /SMTP_TLS_MODE defaults to required/);
    assert.match(workerGuide.contents[0].text, /smtp\.mx\.cloudflare\.net:465/);
    assert.match(workerGuide.contents[0].text, /Cloudflare Email Sending/);
    assert.match(workerGuide.contents[0].text, /paperboy_list_message_events/);
    assert.match(workerGuide.contents[0].text, /persisted tracking opt-in/);

    const webhookGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[6],
    });
    assert.match(webhookGuide.contents[0].text, /webhook-signature/);
    assert.match(webhookGuide.contents[0].text, /HMAC-SHA256/);
    assert.match(webhookGuide.contents[0].text, /Cloudflare Email Service/);

    const feedbackGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[7],
    });
    assert.match(feedbackGuide.contents[0].text, /RFC 3464/);
    assert.match(feedbackGuide.contents[0].text, /recipient_suppressed/);
    assert.match(feedbackGuide.contents[0].text, /Cloudflare Email Sending/);
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

test("broadcasts are first-class tenant-bound MCP operations with UTC progress", async () => {
  const calls = [];
  const payload = {
    audience: [
      {
        data: { reader: { name: "Ada" } },
        email: "reader@example.net",
      },
    ],
    from: "news@example.com",
    name: "Morning edition",
    templateId: firstTemplate.id,
  };

  await withClient(
    dependencies({
      broadcasts: broadcastServices({
        cancel: async (principal, broadcastId) => {
          calls.push(["cancel", principal, broadcastId]);
          return firstBroadcast;
        },
        create: async (principal, received) => {
          calls.push(["create", principal, received]);
          return firstBroadcast;
        },
        list: async (principal) => {
          calls.push(["list", principal]);
          return [firstBroadcast];
        },
      }),
    }),
    async (client) => {
      const listed = await client.callTool({
        arguments: {},
        name: "paperboy_list_broadcasts",
      });
      const created = await client.callTool({
        arguments: payload,
        name: "paperboy_create_broadcast",
      });
      const cancelled = await client.callTool({
        arguments: { broadcastId: firstBroadcast.id, confirm: true },
        name: "paperboy_cancel_broadcast",
      });

      assert.deepEqual(listed.structuredContent, {
        broadcasts: [
          {
            ...firstBroadcast,
            cancelledAt: null,
            completedAt: fixedNow.toISOString(),
            createdAt: fixedNow.toISOString(),
            updatedAt: fixedNow.toISOString(),
          },
        ],
        observedAt: fixedNow.toISOString(),
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
      });
      assert.equal(created.structuredContent.broadcast.progress.total, 20);
      assert.equal(created.structuredContent.protocolTimeZone, "UTC");
      assert.equal(cancelled.structuredContent.broadcast.id, firstBroadcast.id);
      assert.equal(JSON.stringify(created).includes("reader@example.net"), false);
      assert.deepEqual(calls, [
        ["list", firstPrincipal],
        ["create", firstPrincipal, payload],
        ["cancel", firstPrincipal, firstBroadcast.id],
      ]);
    },
  );
});

test("delivery status is first-class, tenant-bound, UTC, and content-free", async () => {
  const calls = [];

  await withClient(
    dependencies({
      deliveries: deliveryServices({
        get: async (principal, messageId) => {
          calls.push(["get", principal, messageId]);
          return firstDelivery;
        },
        list: async (principal, limit) => {
          calls.push(["list", principal, limit]);
          return [firstDelivery];
        },
        listEvents: async (principal, messageId) => {
          calls.push(["listEvents", principal, messageId]);
          return [firstEvent];
        },
      }),
    }),
    async (client) => {
      const listed = await client.callTool({
        arguments: { limit: 7 },
        name: "paperboy_list_delivery_statuses",
      });
      const fetched = await client.callTool({
        arguments: { messageId: firstDelivery.id },
        name: "paperboy_get_delivery_status",
      });
      const events = await client.callTool({
        arguments: { messageId: firstDelivery.id },
        name: "paperboy_list_message_events",
      });

      assert.deepEqual(listed.structuredContent, {
        deliveries: [
          {
            ...firstDelivery,
            createdAt: fixedNow.toISOString(),
            failedAt: null,
            lastAttemptAt: fixedNow.toISOString(),
            leaseExpiresAt: null,
            nextAttemptAt: fixedNow.toISOString(),
            sentAt: null,
            updatedAt: fixedNow.toISOString(),
          },
        ],
        observedAt: fixedNow.toISOString(),
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
      });
      assert.equal(fetched.structuredContent.delivery.id, firstDelivery.id);
      assert.equal(fetched.structuredContent.protocolTimeZone, "UTC");
      assert.deepEqual(events.structuredContent, {
        events: [
          {
            createdAt: fixedNow.toISOString(),
            id: firstEvent.id,
            messageId: firstEvent.messageId,
            type: firstEvent.type,
          },
        ],
        observedAt: fixedNow.toISOString(),
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
      });
      assert.equal(JSON.stringify(listed).includes("reader@example.net"), false);
      assert.equal(JSON.stringify(listed).includes("Hello"), false);
      assert.equal(JSON.stringify(events).includes("reader@example.net"), false);
      assert.equal(JSON.stringify(events).includes("private-provider"), false);
      assert.equal(JSON.stringify(events).includes("sequence"), false);
      assert.deepEqual(calls, [
        ["list", firstPrincipal, 7],
        ["get", firstPrincipal, firstDelivery.id],
        ["listEvents", firstPrincipal, firstDelivery.id],
      ]);
    },
  );
});

test("webhook configuration is first-class and returns a new secret once", async () => {
  const calls = [];

  await withClient(
    dependencies({
      webhooks: webhookServices({
        configure: async (principal, payload) => {
          calls.push(["configure", principal, payload]);
          return {
            endpoint: firstWebhook,
            signingSecret: "whsec_shown-once",
          };
        },
        get: async (principal) => {
          calls.push(["get", principal]);
          return firstWebhook;
        },
      }),
    }),
    async (client) => {
      const configured = await client.callTool({
        arguments: { url: firstWebhook.url },
        name: "paperboy_configure_webhook",
      });
      const fetched = await client.callTool({
        arguments: {},
        name: "paperboy_get_webhook",
      });

      assert.deepEqual(configured.structuredContent, {
        observedAt: fixedNow.toISOString(),
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        signingSecret: "whsec_shown-once",
        webhook: {
          ...firstWebhook,
          createdAt: fixedNow.toISOString(),
          updatedAt: fixedNow.toISOString(),
        },
      });
      assert.equal(fetched.structuredContent.webhook.id, firstWebhook.id);
      assert.equal(JSON.stringify(fetched).includes("whsec_"), false);
      assert.equal(JSON.stringify(fetched).includes("encrypted"), false);
      assert.deepEqual(calls, [
        ["configure", firstPrincipal, { url: firstWebhook.url }],
        ["get", firstPrincipal],
      ]);
    },
  );
});

test("feedback ingestion is tenant-bound, UTC, idempotent, and content-free", async () => {
  const calls = [];
  const raw = await readFile(
    new URL("fixtures/feedback/hard-bounce.eml", import.meta.url),
  );

  await withClient(
    dependencies({
      feedback: feedbackServices({
        ingest: async (principal, received) => {
          calls.push([principal, received]);
          return [firstFeedback];
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: { rawReportBase64: raw.toString("base64") },
        name: "paperboy_ingest_feedback",
      });

      assert.deepEqual(result.structuredContent, {
        data: [
          {
            classification: "hard_bounce",
            eventId: firstFeedback.eventId,
            ingestedAt: fixedNow.toISOString(),
            messageId: firstMessage.id,
            replayed: false,
            suppressed: true,
          },
        ],
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
      });
      assert.deepEqual(calls[0][0], firstPrincipal);
      assert.deepEqual(calls[0][1], raw);
      assert.equal(JSON.stringify(result).includes("hard-bounce@example.net"), false);
      assert.equal(JSON.stringify(result).includes(raw.toString("base64")), false);
    },
  );
});

test("template CRUD is tenant-bound and reports UTC protocol timestamps", async () => {
  const calls = [];

  await withClient(
    dependencies({
      templates: templateServices({
        create: async (principal, payload) => {
          calls.push(["create", principal, payload]);
          return firstTemplate;
        },
        delete: async (principal, templateId) => {
          calls.push(["delete", principal, templateId]);
        },
        list: async (principal) => {
          calls.push(["list", principal]);
          return [firstTemplate];
        },
        preview: async (principal, templateId, data) => {
          calls.push(["preview", principal, templateId, data]);
          return {
            html: "<p>Hello </p>",
            missingVariables: ["reader.name"],
            subject: "Welcome, ",
            text: "Hello ",
          };
        },
      }),
    }),
    async (client) => {
      const listed = await client.callTool({
        arguments: {},
        name: "paperboy_list_templates",
      });
      const created = await client.callTool({
        arguments: {
          name: firstTemplate.name,
          subject: firstTemplate.subject,
          text: firstTemplate.text,
        },
        name: "paperboy_create_template",
      });
      const previewed = await client.callTool({
        arguments: {
          data: {},
          templateId: firstTemplate.id,
        },
        name: "paperboy_preview_template",
      });
      const deleted = await client.callTool({
        arguments: { confirm: true, templateId: firstTemplate.id },
        name: "paperboy_delete_template",
      });

      assert.equal(listed.isError, undefined);
      assert.equal(listed.structuredContent.protocolTimeZone, "UTC");
      assert.equal(
        listed.structuredContent.templates[0].createdAt,
        fixedNow.toISOString(),
      );
      assert.equal(created.structuredContent.template.id, firstTemplate.id);
      assert.deepEqual(previewed.structuredContent, {
        html: "<p>Hello </p>",
        missingVariables: ["reader.name"],
        observedAt: fixedNow.toISOString(),
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        subject: "Welcome, ",
        templateId: firstTemplate.id,
        text: "Hello ",
      });
      assert.deepEqual(deleted.structuredContent, {
        deleted: true,
        observedAt: fixedNow.toISOString(),
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        templateId: firstTemplate.id,
      });
      assert.deepEqual(calls, [
        ["list", firstPrincipal],
        [
          "create",
          firstPrincipal,
          {
            name: firstTemplate.name,
            subject: firstTemplate.subject,
            text: firstTemplate.text,
          },
        ],
        ["preview", firstPrincipal, firstTemplate.id, {}],
        ["delete", firstPrincipal, firstTemplate.id],
      ]);
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

      const templated = await client.callTool({
        arguments: {
          data: { reader: { name: "Ada" } },
          from: "sender@example.com",
          template_id: firstTemplate.id,
          to: ["reader@example.net"],
        },
        name: "paperboy_send_email",
      });

      assert.equal(templated.isError, undefined);
      assert.deepEqual(received, {
        idempotencyKey: undefined,
        payload: {
          data: { reader: { name: "Ada" } },
          from: "sender@example.com",
          template_id: firstTemplate.id,
          to: ["reader@example.net"],
        },
        principal: firstPrincipal,
      });
      assert.equal(JSON.stringify(templated).includes("Ada"), false);
    },
  );
});

test("MCP sending reports suppression without queueing", async () => {
  await withClient(
    dependencies({
      emails: emailServices({
        queue: async () => {
          throw new EmailError("RECIPIENT_SUPPRESSED", [
            {
              field: "to.0",
              message: "Recipient is suppressed after a permanent bounce.",
            },
          ]);
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: {
          from: "sender@example.com",
          subject: "Must not send",
          text: "Body",
          to: ["hard-bounce@example.net"],
        },
        name: "paperboy_send_email",
      });

      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /suppressed after a bounce/);
      assert.equal(JSON.stringify(result).includes("hard-bounce@example.net"), false);
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
      data: { reader: { name: "Second" } },
      from: "sender@example.com",
      template_id: firstTemplate.id,
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

test("batch sending reports missing required template variables", async () => {
  await withClient(
    dependencies({
      emails: emailServices({
        queueBatch: async () => [
          {
            error: new TemplateError("MISSING_REQUIRED_VARIABLES", [
              {
                field: "data.reader.name",
                message: "This required template variable is missing.",
              },
            ]),
            ok: false,
          },
        ],
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: {
          emails: [
            {
              data: {},
              from: "sender@example.com",
              template_id: firstTemplate.id,
              to: ["reader@example.net"],
            },
          ],
        },
        name: "paperboy_send_email_batch",
      });

      assert.deepEqual(result.structuredContent.data[0].error, {
        code: "missing_template_variables",
        fields: [
          {
            field: "data.reader.name",
            message: "This required template variable is missing.",
          },
        ],
        message: "Provide every required template variable and try again.",
      });
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
