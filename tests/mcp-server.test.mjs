import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import {
  DNS_OPERATOR_GUIDE,
} from "../src/lib/dns-operator-guide.ts";
import { EmailError } from "../src/lib/email-core.ts";
import { OpenTrackingConfigurationError } from "../src/lib/open-tracking-core.ts";
import { RateLimitError } from "../src/lib/rate-limit-core.ts";
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
  provider: "test-sink",
  replayed: false,
  status: "queued",
};
const firstDelivery = {
  attemptCount: 2,
  createdAt: fixedNow,
  deliveryMode: "test-sink",
  domainId: null,
  environment: "test",
  failedAt: null,
  failureReason: "Outbound HTTP provider returned 503.",
  id: firstMessage.id,
  lastAttemptAt: fixedNow,
  lastErrorCode: "http_503",
  leaseExpiresAt: null,
  nextAttemptAt: fixedNow,
  provider: "test-sink",
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
const firstSuppression = {
  createdAt: fixedNow,
  email: "blocked@example.net",
  id: "dededede-dede-4ede-8ede-dededededede",
  reason: "complained",
  updatedAt: fixedNow,
};
const firstAudience = {
  activeContactCount: 1,
  contactCount: 1,
  createdAt: fixedNow,
  id: "12121212-1212-4212-8212-121212121212",
  name: "Weekly readers",
  updatedAt: fixedNow,
};
const firstContact = {
  audienceId: firstAudience.id,
  createdAt: fixedNow,
  email: "reader@example.net",
  id: "13131313-1313-4313-8313-131313131313",
  name: "Ada",
  unsubscribedAt: null,
  updatedAt: fixedNow,
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
  scheduledFor: null,
  sourceAudienceId: firstAudience.id,
  sourceTemplateId: firstTemplate.id,
  status: "completed",
  templateName: firstTemplate.name,
  updatedAt: fixedNow,
};
const firstRateLimits = {
  defaultLiveLimitPerMinute: 60,
  defaultTestLimitPerMinute: 600,
  liveLimitPerMinute: 90,
  liveOverridePerMinute: 90,
  testLimitPerMinute: 900,
  testOverridePerMinute: 900,
  updatedAt: fixedNow,
};
const firstOpenTracking = {
  enabled: false,
  updatedAt: fixedNow,
};
const firstOutboundProviders = {
  defaultProvider: "smtp",
  domains: [
    {
      effectiveProvider: "smtp",
      id: firstDomain.id,
      name: firstDomain.name,
      overrideProvider: null,
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
    {
      capabilities: { batch: false, events: true, scheduling: false },
      configured: true,
      credentialScope: "operator-default",
      id: "cloudflare-email",
      label: "Cloudflare Email Service",
      state: "ready",
    },
    {
      capabilities: { batch: true, events: true, scheduling: false },
      configured: true,
      credentialScope: "organization",
      id: "aws-ses",
      label: "Amazon SES",
      state: "ready",
    },
    {
      capabilities: { batch: true, events: true, scheduling: false },
      configured: false,
      credentialScope: null,
      id: "azure-email",
      label: "Azure Communication Services Email",
      state: "adapter-unavailable",
    },
  ],
  updatedAt: fixedNow,
};

function audienceServices(overrides = {}) {
  return {
    createAudience: async () => firstAudience,
    createContact: async () => firstContact,
    deleteAudience: async () => undefined,
    deleteContact: async () => undefined,
    deleteUnsubscribedContacts: async () => ({ deleted: 1 }),
    getAudience: async () => firstAudience,
    getContact: async () => firstContact,
    importContacts: async () => ({
      created: 1,
      importedAt: fixedNow,
      inputRows: 2,
      unchanged: 1,
      uniqueRows: 2,
      updated: 0,
    }),
    listAudiences: async () => [firstAudience],
    listContacts: async () => [firstContact],
    updateAudience: async () => firstAudience,
    updateContact: async () => firstContact,
    ...overrides,
  };
}

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

function rateLimitServices(overrides = {}) {
  return {
    get: async () => firstRateLimits,
    update: async () => firstRateLimits,
    ...overrides,
  };
}

function openTrackingServices(overrides = {}) {
  return {
    get: async () => firstOpenTracking,
    update: async () => firstOpenTracking,
    ...overrides,
  };
}

function outboundProviderServices(overrides = {}) {
  return {
    get: async () => firstOutboundProviders,
    ingest: async () => [],
    test: async (_principal, payload) => ({
      details: null,
      provider: payload.provider,
      testedAt: fixedNow,
    }),
    update: async () => firstOutboundProviders,
    ...overrides,
  };
}

function suppressionServices(overrides = {}) {
  return {
    create: async () => firstSuppression,
    delete: async () => undefined,
    get: async () => firstSuppression,
    import: async () => ({
      created: 1,
      importedAt: fixedNow,
      inputRows: 2,
      unchanged: 1,
      uniqueRows: 2,
      updated: 0,
    }),
    list: async () => [firstSuppression],
    update: async () => firstSuppression,
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
    audiences: audienceServices(),
    broadcasts: broadcastServices(),
    deliveries: deliveryServices(),
    domains: domainServices(),
    emails: emailServices(),
    feedback: feedbackServices(),
    findOrganization: async (orgId) =>
      orgId === firstOrganization.id ? firstOrganization : null,
    openTracking: openTrackingServices(),
    outboundProviders: outboundProviderServices(),
    rateLimits: rateLimitServices(),
    templates: templateServices(),
    suppressions: suppressionServices(),
    webhooks: webhookServices(),
    ...overrides,
  };
}

test("initializes and publishes versioned tool schemas", async () => {
  await withClient(dependencies(), async (client) => {
    const { tools } = await client.listTools();
    const outputSchemaSnapshots = {
      paperboy_create_audience: ["audience", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_create_contact: ["contact", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_delete_audience: ["deletedId", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_delete_contact: ["deletedId", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_delete_unsubscribed_contacts: ["deleted", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_get_audience: ["audience", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_get_contact: ["contact", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_import_contacts: ["created", "importedAt", "inputRows", "unchanged", "uniqueRows", "updated", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_list_audiences: ["audiences", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_list_contacts: ["contacts", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_update_audience: ["audience", "observedAt", "protocolTimeZone", "schemaVersion"],
      paperboy_update_contact: ["contact", "observedAt", "protocolTimeZone", "schemaVersion"],
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
      paperboy_create_suppression: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "suppression",
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
      paperboy_delete_suppression: [
        "deleted",
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "suppressionId",
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
      paperboy_get_suppression: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "suppression",
      ],
      paperboy_get_webhook: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "webhook",
      ],
      paperboy_get_rate_limits: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "settings",
      ],
      paperboy_get_open_tracking: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "settings",
      ],
      paperboy_get_outbound_providers: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "settings",
      ],
      paperboy_ingest_feedback: [
        "data",
        "protocolTimeZone",
        "schemaVersion",
      ],
      paperboy_import_suppressions: [
        "created",
        "importedAt",
        "inputRows",
        "protocolTimeZone",
        "schemaVersion",
        "unchanged",
        "uniqueRows",
        "updated",
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
      paperboy_list_suppressions: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "suppressions",
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
        "provider",
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
      paperboy_update_suppression: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "suppression",
      ],
      paperboy_update_rate_limits: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "settings",
      ],
      paperboy_update_open_tracking: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "settings",
      ],
      paperboy_update_outbound_providers: [
        "observedAt",
        "protocolTimeZone",
        "schemaVersion",
        "settings",
      ],
      paperboy_test_outbound_provider: [
        "details",
        "ok",
        "protocolTimeZone",
        "provider",
        "schemaVersion",
        "testedAt",
      ],
      paperboy_ingest_outbound_provider_event: [
        "data",
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
      paperboy_create_audience: ["name"],
      paperboy_create_contact: ["audienceId", "email", "name"],
      paperboy_delete_audience: ["audienceId", "confirm"],
      paperboy_delete_contact: ["audienceId", "contactId", "confirm"],
      paperboy_delete_unsubscribed_contacts: ["audienceId", "confirm"],
      paperboy_get_audience: ["audienceId"],
      paperboy_get_contact: ["audienceId", "contactId"],
      paperboy_import_contacts: ["audienceId", "csv"],
      paperboy_list_audiences: [],
      paperboy_list_contacts: ["audienceId"],
      paperboy_update_audience: ["audienceId", "name"],
      paperboy_update_contact: ["audienceId", "contactId", "email", "name"],
      paperboy_cancel_broadcast: ["broadcastId", "confirm"],
      paperboy_create_broadcast: [
        "audienceId",
        "from",
        "name",
        "scheduledFor",
        "templateId",
      ],
      paperboy_create_domain: ["name"],
      paperboy_create_template: [
        "html",
        "name",
        "requiredVariables",
        "subject",
        "text",
      ],
      paperboy_create_suppression: ["email", "reason"],
      paperboy_delete_domain: ["confirm", "domainId"],
      paperboy_delete_template: ["confirm", "templateId"],
      paperboy_delete_suppression: ["confirm", "suppressionId"],
      paperboy_finalize_domain_dkim_rotation: ["confirm", "domainId"],
      paperboy_get_account_context: [],
      paperboy_get_broadcast: ["broadcastId"],
      paperboy_get_delivery_status: ["messageId"],
      paperboy_get_template: ["templateId"],
      paperboy_get_suppression: ["suppressionId"],
      paperboy_get_webhook: [],
      paperboy_get_rate_limits: [],
      paperboy_get_open_tracking: [],
      paperboy_get_outbound_providers: [],
      paperboy_ingest_feedback: ["rawReportBase64"],
      paperboy_ingest_outbound_provider_event: ["payload", "provider"],
      paperboy_import_suppressions: ["csv"],
      paperboy_list_capabilities: [],
      paperboy_list_broadcasts: [],
      paperboy_list_domains: [],
      paperboy_list_delivery_statuses: [
        "createdAtBefore",
        "createdAtFrom",
        "domainId",
        "limit",
        "status",
      ],
      paperboy_list_message_events: ["messageId"],
      paperboy_list_templates: [],
      paperboy_list_suppressions: ["limit", "query", "reason"],
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
      paperboy_update_suppression: ["email", "reason", "suppressionId"],
      paperboy_update_rate_limits: [
        "liveLimitPerMinute",
        "testLimitPerMinute",
      ],
      paperboy_update_open_tracking: ["enabled"],
      paperboy_update_outbound_providers: [
        "defaultProvider",
        "domainOverrides",
      ],
      paperboy_test_outbound_provider: ["provider"],
      paperboy_ingest_outbound_provider_event: ["payload", "provider"],
      paperboy_verify_domain: ["domainId"],
    };
    const requiredInputSchemaSnapshots = {
      paperboy_create_broadcast: ["audienceId", "from", "name", "templateId"],
      paperboy_create_contact: ["audienceId", "email"],
      paperboy_create_template: ["name", "subject"],
      paperboy_create_suppression: ["email"],
      paperboy_ingest_feedback: ["rawReportBase64"],
      paperboy_import_suppressions: ["csv"],
      paperboy_list_suppressions: [],
      paperboy_list_delivery_statuses: [],
      paperboy_send_email: ["from", "to"],
      paperboy_update_template: ["templateId"],
      paperboy_update_suppression: ["suppressionId"],
      paperboy_update_contact: ["audienceId", "contactId"],
      paperboy_update_rate_limits: [],
      paperboy_update_open_tracking: ["enabled"],
      paperboy_update_outbound_providers: [],
    };
    const annotationSnapshots = {
      paperboy_create_audience: { destructive: false, readOnly: false },
      paperboy_create_contact: { destructive: false, readOnly: false },
      paperboy_delete_audience: { destructive: true, readOnly: false },
      paperboy_delete_contact: { destructive: true, readOnly: false },
      paperboy_delete_unsubscribed_contacts: { destructive: true, readOnly: false },
      paperboy_get_audience: { destructive: false, readOnly: true },
      paperboy_get_contact: { destructive: false, readOnly: true },
      paperboy_import_contacts: { destructive: false, readOnly: false },
      paperboy_list_audiences: { destructive: false, readOnly: true },
      paperboy_list_contacts: { destructive: false, readOnly: true },
      paperboy_update_audience: { destructive: false, readOnly: false },
      paperboy_update_contact: { destructive: false, readOnly: false },
      paperboy_cancel_broadcast: { destructive: true, readOnly: false },
      paperboy_create_broadcast: { destructive: false, readOnly: false },
      paperboy_create_domain: { destructive: false, readOnly: false },
      paperboy_create_template: { destructive: false, readOnly: false },
      paperboy_create_suppression: { destructive: false, readOnly: false },
      paperboy_delete_domain: { destructive: true, readOnly: false },
      paperboy_delete_template: { destructive: true, readOnly: false },
      paperboy_delete_suppression: { destructive: true, readOnly: false },
      paperboy_finalize_domain_dkim_rotation: {
        destructive: true,
        readOnly: false,
      },
      paperboy_get_account_context: { destructive: false, readOnly: true },
      paperboy_get_broadcast: { destructive: false, readOnly: true },
      paperboy_get_delivery_status: { destructive: false, readOnly: true },
      paperboy_get_template: { destructive: false, readOnly: true },
      paperboy_get_suppression: { destructive: false, readOnly: true },
      paperboy_get_webhook: { destructive: false, readOnly: true },
      paperboy_get_rate_limits: { destructive: false, readOnly: true },
      paperboy_get_open_tracking: { destructive: false, readOnly: true },
      paperboy_get_outbound_providers: { destructive: false, readOnly: true },
      paperboy_ingest_feedback: { destructive: false, readOnly: false },
      paperboy_import_suppressions: { destructive: false, readOnly: false },
      paperboy_list_capabilities: { destructive: false, readOnly: true },
      paperboy_list_broadcasts: { destructive: false, readOnly: true },
      paperboy_list_domains: { destructive: false, readOnly: true },
      paperboy_list_delivery_statuses: { destructive: false, readOnly: true },
      paperboy_list_message_events: { destructive: false, readOnly: true },
      paperboy_list_templates: { destructive: false, readOnly: true },
      paperboy_list_suppressions: { destructive: false, readOnly: true },
      paperboy_configure_webhook: { destructive: false, readOnly: false },
      paperboy_preview_template: { destructive: false, readOnly: true },
      paperboy_pause_broadcast: { destructive: false, readOnly: false },
      paperboy_resume_broadcast: { destructive: false, readOnly: false },
      paperboy_rotate_domain_dkim: { destructive: false, readOnly: false },
      paperboy_send_email: { destructive: false, readOnly: false },
      paperboy_send_email_batch: { destructive: false, readOnly: false },
      paperboy_setup_domain_dkim: { destructive: false, readOnly: false },
      paperboy_update_template: { destructive: false, readOnly: false },
      paperboy_update_suppression: { destructive: false, readOnly: false },
      paperboy_update_rate_limits: { destructive: false, readOnly: false },
      paperboy_update_open_tracking: { destructive: false, readOnly: false },
      paperboy_update_outbound_providers: { destructive: false, readOnly: false },
      paperboy_test_outbound_provider: { destructive: false, readOnly: false },
      paperboy_ingest_outbound_provider_event: {
        destructive: false,
        readOnly: false,
      },
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

    const providerGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[12],
    });
    assert.match(providerGuide.contents[0].text, /Cloudflare Email Service/);
    assert.match(providerGuide.contents[0].text, /snapshotted/);
    assert.match(providerGuide.contents[0].text, /RFC 3339 UTC/);

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

    const suppressionGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[8],
    });
    assert.match(suppressionGuide.contents[0].text, /5,000 data rows/);
    assert.match(suppressionGuide.contents[0].text, /recipient_suppressed/);
    assert.match(suppressionGuide.contents[0].text, /Cloudflare Email Sending/);

    const audienceGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[9],
    });
    assert.match(audienceGuide.contents[0].text, /PAPERBOY_UNSUBSCRIBE_SIGNING_KEY/);
    assert.match(audienceGuide.contents[0].text, /permission/);
    assert.match(audienceGuide.contents[0].text, /Cloudflare Email Sending/);

    const rateLimitGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[10],
    });
    assert.match(rateLimitGuide.contents[0].text, /fixed UTC minutes/);
    assert.match(rateLimitGuide.contents[0].text, /Retry-After/);
    assert.match(rateLimitGuide.contents[0].text, /Cloudflare Email Sending/);

    const openTrackingGuide = await client.readResource({
      uri: PAPERBOY_MCP_RESOURCE_URIS[11],
    });
    assert.match(openTrackingGuide.contents[0].text, /off by default/);
    assert.match(openTrackingGuide.contents[0].text, /at most one opened event/);
    assert.match(openTrackingGuide.contents[0].text, /Cloudflare Email Service/);
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

test("audiences and contacts are first-class tenant-bound MCP operations", async () => {
  const calls = [];
  await withClient(
    dependencies({
      audiences: audienceServices({
        createContact: async (principal, audienceId, payload) => {
          calls.push(["createContact", principal, audienceId, payload]);
          return firstContact;
        },
        importContacts: async (principal, audienceId, csv) => {
          calls.push(["importContacts", principal, audienceId, csv]);
          return audienceServices().importContacts();
        },
        deleteUnsubscribedContacts: async (principal, audienceId) => {
          calls.push(["deleteUnsubscribedContacts", principal, audienceId]);
          return { deleted: 1 };
        },
        listAudiences: async (principal) => {
          calls.push(["listAudiences", principal]);
          return [firstAudience];
        },
      }),
    }),
    async (client) => {
      const listed = await client.callTool({
        arguments: {},
        name: "paperboy_list_audiences",
      });
      const created = await client.callTool({
        arguments: {
          audienceId: firstAudience.id,
          email: firstContact.email,
          name: firstContact.name,
        },
        name: "paperboy_create_contact",
      });
      const imported = await client.callTool({
        arguments: {
          audienceId: firstAudience.id,
          csv: "email,name\nreader@example.net,Ada\n",
        },
        name: "paperboy_import_contacts",
      });
      const deleted = await client.callTool({
        arguments: { audienceId: firstAudience.id, confirm: true },
        name: "paperboy_delete_unsubscribed_contacts",
      });

      assert.equal(listed.structuredContent.audiences[0].name, firstAudience.name);
      assert.equal(listed.structuredContent.protocolTimeZone, "UTC");
      assert.equal(created.structuredContent.contact.email, firstContact.email);
      assert.equal(created.structuredContent.contact.unsubscribedAt, null);
      assert.equal(imported.structuredContent.importedAt, fixedNow.toISOString());
      assert.equal(deleted.structuredContent.deleted, 1);
      assert.deepEqual(calls, [
        ["listAudiences", firstPrincipal],
        [
          "createContact",
          firstPrincipal,
          firstAudience.id,
          { email: firstContact.email, name: firstContact.name },
        ],
        [
          "importContacts",
          firstPrincipal,
          firstAudience.id,
          "email,name\nreader@example.net,Ada\n",
        ],
        ["deleteUnsubscribedContacts", firstPrincipal, firstAudience.id],
      ]);
      assert.equal(JSON.stringify(calls).includes("organizationId"), false);
    },
  );
});

test("rate limits are first-class tenant-bound MCP settings with UTC metadata", async () => {
  const calls = [];
  await withClient(
    dependencies({
      rateLimits: rateLimitServices({
        get: async (principal) => {
          calls.push(["get", principal]);
          return firstRateLimits;
        },
        update: async (principal, payload) => {
          calls.push(["update", principal, payload]);
          return firstRateLimits;
        },
      }),
    }),
    async (client) => {
      const read = await client.callTool({
        arguments: {},
        name: "paperboy_get_rate_limits",
      });
      const updated = await client.callTool({
        arguments: {
          liveLimitPerMinute: 90,
          testLimitPerMinute: 900,
        },
        name: "paperboy_update_rate_limits",
      });

      assert.equal(read.structuredContent.settings.liveLimitPerMinute, 90);
      assert.equal(read.structuredContent.protocolTimeZone, "UTC");
      assert.equal(
        updated.structuredContent.settings.updatedAt,
        fixedNow.toISOString(),
      );
      assert.deepEqual(calls, [
        ["get", firstPrincipal],
        [
          "update",
          firstPrincipal,
          { live_limit_per_minute: 90, test_limit_per_minute: 900 },
        ],
      ]);
      assert.equal(JSON.stringify(calls).includes("orgId"), true);
      assert.equal(JSON.stringify(calls).includes("organizationId"), false);
    },
  );
});

test("open tracking is a first-class tenant-bound MCP setting with UTC metadata", async () => {
  const calls = [];
  await withClient(
    dependencies({
      openTracking: openTrackingServices({
        get: async (principal) => {
          calls.push(["get", principal]);
          return firstOpenTracking;
        },
        update: async (principal, payload) => {
          calls.push(["update", principal, payload]);
          return { ...firstOpenTracking, enabled: true };
        },
      }),
    }),
    async (client) => {
      const read = await client.callTool({
        arguments: {},
        name: "paperboy_get_open_tracking",
      });
      const updated = await client.callTool({
        arguments: { enabled: true },
        name: "paperboy_update_open_tracking",
      });

      assert.equal(read.structuredContent.settings.enabled, false);
      assert.equal(read.structuredContent.protocolTimeZone, "UTC");
      assert.equal(updated.structuredContent.settings.enabled, true);
      assert.equal(
        updated.structuredContent.settings.updatedAt,
        fixedNow.toISOString(),
      );
      assert.deepEqual(calls, [
        ["get", firstPrincipal],
        ["update", firstPrincipal, { enabled: true }],
      ]);
      assert.equal(JSON.stringify(calls).includes("organizationId"), false);
    },
  );
});

test("outbound providers are first-class tenant-bound MCP settings, tests, and events", async () => {
  const calls = [];
  await withClient(
    dependencies({
      outboundProviders: outboundProviderServices({
        get: async (principal) => {
          calls.push(["get", principal]);
          return firstOutboundProviders;
        },
        ingest: async (principal, provider, payload) => {
          calls.push(["ingest", principal, provider, payload]);
          return [
            {
              createdAt: fixedNow,
              eventId: "14141414-1414-4414-8414-141414141414",
              messageId: firstMessage.id,
              provider: "aws-ses",
              providerEventId: "ses-event-fixture",
              replayed: false,
              suppressionCount: 1,
              type: "bounced",
            },
          ];
        },
        test: async (principal, payload) => {
          calls.push(["test", principal, payload]);
          return {
            details: {
              accountMode: "production",
              region: "ap-southeast-2",
              sendingEnabled: true,
              verifiedDomains: ["rangeros.com.au", "yumait.au"],
            },
            provider: payload.provider,
            testedAt: fixedNow,
          };
        },
        update: async (principal, payload) => {
          calls.push(["update", principal, payload]);
          return firstOutboundProviders;
        },
      }),
    }),
    async (client) => {
      const read = await client.callTool({
        arguments: {},
        name: "paperboy_get_outbound_providers",
      });
      const updated = await client.callTool({
        arguments: {
          defaultProvider: "cloudflare-email",
          domainOverrides: [
            { domainId: firstDomain.id, provider: "smtp" },
          ],
        },
        name: "paperboy_update_outbound_providers",
      });
      const tested = await client.callTool({
        arguments: { provider: "aws-ses" },
        name: "paperboy_test_outbound_provider",
      });
      const ingested = await client.callTool({
        arguments: {
          payload: { eventType: "Bounce" },
          provider: "aws-ses",
        },
        name: "paperboy_ingest_outbound_provider_event",
      });

      assert.equal(read.structuredContent.settings.defaultProvider, "smtp");
      assert.equal(read.structuredContent.protocolTimeZone, "UTC");
      assert.equal(
        read.structuredContent.settings.providers[1].credentialScope,
        "operator-default",
      );
      assert.equal(updated.structuredContent.settings.domains[0].updatedAt, fixedNow.toISOString());
      assert.equal(tested.structuredContent.testedAt, fixedNow.toISOString());
      assert.deepEqual(tested.structuredContent.details, {
        accountMode: "production",
        region: "ap-southeast-2",
        sendingEnabled: true,
        verifiedDomains: ["rangeros.com.au", "yumait.au"],
      });
      assert.equal(ingested.structuredContent.data[0].suppressionCount, 1);
      assert.equal(ingested.structuredContent.protocolTimeZone, "UTC");
      assert.equal(JSON.stringify(read).includes("test-token"), false);
      assert.deepEqual(calls, [
        ["get", firstPrincipal],
        [
          "update",
          firstPrincipal,
          {
            default_provider: "cloudflare-email",
            domain_overrides: [
              { domain_id: firstDomain.id, provider: "smtp" },
            ],
          },
        ],
        ["test", firstPrincipal, { provider: "aws-ses" }],
        [
          "ingest",
          firstPrincipal,
          "aws-ses",
          { eventType: "Bounce" },
        ],
      ]);
    },
  );
});

test("broadcasts are first-class tenant-bound MCP operations with UTC progress", async () => {
  const calls = [];
  const payload = {
    audienceId: firstAudience.id,
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

test("delivery status is first-class, filtered, tenant-bound, UTC, and content-free", async () => {
  const calls = [];

  await withClient(
    dependencies({
      deliveries: deliveryServices({
        get: async (principal, messageId) => {
          calls.push(["get", principal, messageId]);
          return firstDelivery;
        },
        list: async (principal, filters) => {
          calls.push(["list", principal, filters]);
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
        arguments: {
          createdAtBefore: "2026-08-24T00:00:00.000Z",
          createdAtFrom: "2026-08-23T00:00:00.000Z",
          domainId: firstDomain.id,
          limit: 7,
          status: "queued",
        },
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
        [
          "list",
          firstPrincipal,
          {
            createdAtBefore: new Date("2026-08-24T00:00:00.000Z"),
            createdAtFrom: new Date("2026-08-23T00:00:00.000Z"),
            domainId: firstDomain.id,
            limit: 7,
            status: "queued",
          },
        ],
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

test("suppression CRUD and CSV import are first-class tenant-bound MCP operations", async () => {
  const calls = [];
  const csv = "email,reason\nblocked@example.net,complained\n";

  await withClient(
    dependencies({
      suppressions: suppressionServices({
        create: async (principal, payload) => {
          calls.push(["create", principal, payload]);
          return firstSuppression;
        },
        delete: async (principal, suppressionId) => {
          calls.push(["delete", principal, suppressionId]);
        },
        import: async (principal, received) => {
          calls.push(["import", principal, received]);
          return {
            created: 1,
            importedAt: fixedNow,
            inputRows: 1,
            unchanged: 0,
            uniqueRows: 1,
            updated: 0,
          };
        },
        list: async (principal, filter) => {
          calls.push(["list", principal, filter]);
          return [firstSuppression];
        },
      }),
    }),
    async (client) => {
      const listed = await client.callTool({
        arguments: { limit: 25, query: "example.net", reason: "complained" },
        name: "paperboy_list_suppressions",
      });
      const created = await client.callTool({
        arguments: { email: firstSuppression.email, reason: "complained" },
        name: "paperboy_create_suppression",
      });
      const imported = await client.callTool({
        arguments: { csv },
        name: "paperboy_import_suppressions",
      });
      const deleted = await client.callTool({
        arguments: { confirm: true, suppressionId: firstSuppression.id },
        name: "paperboy_delete_suppression",
      });

      assert.deepEqual(listed.structuredContent, {
        observedAt: fixedNow.toISOString(),
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        suppressions: [
          {
            ...firstSuppression,
            createdAt: fixedNow.toISOString(),
            updatedAt: fixedNow.toISOString(),
          },
        ],
      });
      assert.equal(created.structuredContent.suppression.email, firstSuppression.email);
      assert.deepEqual(imported.structuredContent, {
        created: 1,
        importedAt: fixedNow.toISOString(),
        inputRows: 1,
        protocolTimeZone: "UTC",
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        unchanged: 0,
        uniqueRows: 1,
        updated: 0,
      });
      assert.equal(deleted.structuredContent.deleted, true);
      assert.deepEqual(calls, [
        [
          "list",
          firstPrincipal,
          { limit: 25, query: "example.net", reason: "complained" },
        ],
        [
          "create",
          firstPrincipal,
          { email: firstSuppression.email, reason: "complained" },
        ],
        ["import", firstPrincipal, csv],
        ["delete", firstPrincipal, firstSuppression.id],
      ]);
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
        provider: "test-sink",
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

test("MCP sending reports the shared cap and retry delay", async () => {
  await withClient(
    dependencies({
      emails: emailServices({
        queue: async () => {
          throw new RateLimitError("live", 60, 23);
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: {
          from: "news@example.com",
          subject: "Capped",
          text: "Try later",
          to: "reader@example.net",
        },
        name: "paperboy_send_email",
      });

      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /live send limit/);
      assert.match(result.content[0].text, /23 seconds/);
    },
  );
});

test("MCP sending reports missing open-tracking operator configuration", async () => {
  await withClient(
    dependencies({
      emails: emailServices({
        queue: async () => {
          throw new OpenTrackingConfigurationError();
        },
      }),
    }),
    async (client) => {
      const result = await client.callTool({
        arguments: {
          from: "news@example.com",
          html: "<p>Edition</p>",
          subject: "Edition",
          to: ["reader@example.net"],
        },
        name: "paperboy_send_email",
      });

      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /dedicated open-tracking signing key/);
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
            provider: "test-sink",
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
