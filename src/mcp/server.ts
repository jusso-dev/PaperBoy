import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { DNS_OPERATOR_GUIDE } from "@/lib/dns-operator-guide";
import type { OrganizationRecord } from "@/lib/organization-reader";
import { protocolTimestamp } from "@/lib/time";
import {
  PAPERBOY_MCP_SCHEMA_VERSION,
  PAPERBOY_MCP_VERSION,
} from "@/mcp/contract";
import {
  PAPERBOY_AUDIENCE_MCP_TOOL_DEFINITIONS,
  PAPERBOY_AUDIENCE_MCP_TOOL_NAMES,
  registerPaperBoyAudienceTools,
  type PaperBoyMcpAudienceServices,
} from "@/mcp/audience-tools";
import {
  PAPERBOY_BROADCAST_MCP_TOOL_DEFINITIONS,
  PAPERBOY_BROADCAST_MCP_TOOL_NAMES,
  registerPaperBoyBroadcastTools,
  type PaperBoyMcpBroadcastServices,
} from "@/mcp/broadcast-tools";
import {
  PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS,
  PAPERBOY_DOMAIN_MCP_TOOL_NAMES,
  registerPaperBoyDomainTools,
  type PaperBoyMcpDomainServices,
} from "@/mcp/domain-tools";
import {
  PAPERBOY_DELIVERY_MCP_TOOL_DEFINITIONS,
  PAPERBOY_DELIVERY_MCP_TOOL_NAMES,
  registerPaperBoyDeliveryTools,
  type PaperBoyMcpDeliveryServices,
} from "@/mcp/delivery-tools";
import {
  PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS,
  PAPERBOY_EMAIL_MCP_TOOL_NAMES,
  registerPaperBoyEmailTools,
  type PaperBoyMcpEmailServices,
} from "@/mcp/email-tools";
import {
  PAPERBOY_FEEDBACK_MCP_TOOL_DEFINITIONS,
  PAPERBOY_FEEDBACK_MCP_TOOL_NAMES,
  registerPaperBoyFeedbackTools,
  type PaperBoyMcpFeedbackServices,
} from "@/mcp/feedback-tools";
import {
  PAPERBOY_RATE_LIMIT_MCP_TOOL_DEFINITIONS,
  PAPERBOY_RATE_LIMIT_MCP_TOOL_NAMES,
  registerPaperBoyRateLimitTools,
  type PaperBoyMcpRateLimitServices,
} from "@/mcp/rate-limit-tools";
import {
  PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS,
  PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES,
  registerPaperBoySuppressionTools,
  type PaperBoyMcpSuppressionServices,
} from "@/mcp/suppression-tools";
import {
  PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS,
  PAPERBOY_TEMPLATE_MCP_TOOL_NAMES,
  registerPaperBoyTemplateTools,
  type PaperBoyMcpTemplateServices,
} from "@/mcp/template-tools";
import {
  PAPERBOY_WEBHOOK_MCP_TOOL_DEFINITIONS,
  PAPERBOY_WEBHOOK_MCP_TOOL_NAMES,
  registerPaperBoyWebhookTools,
  type PaperBoyMcpWebhookServices,
} from "@/mcp/webhook-tools";

export { PAPERBOY_MCP_SCHEMA_VERSION, PAPERBOY_MCP_VERSION };

export const PAPERBOY_MCP_TOOL_NAMES = [
  "paperboy_list_capabilities",
  "paperboy_get_account_context",
  ...PAPERBOY_AUDIENCE_MCP_TOOL_NAMES,
  ...PAPERBOY_EMAIL_MCP_TOOL_NAMES,
  ...PAPERBOY_RATE_LIMIT_MCP_TOOL_NAMES,
  ...PAPERBOY_DELIVERY_MCP_TOOL_NAMES,
  ...PAPERBOY_FEEDBACK_MCP_TOOL_NAMES,
  ...PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES,
  ...PAPERBOY_WEBHOOK_MCP_TOOL_NAMES,
  ...PAPERBOY_TEMPLATE_MCP_TOOL_NAMES,
  ...PAPERBOY_BROADCAST_MCP_TOOL_NAMES,
  ...PAPERBOY_DOMAIN_MCP_TOOL_NAMES,
] as const;

export const PAPERBOY_MCP_RESOURCE_URIS = [
  "paperboy://docs/configuration",
  "paperboy://docs/operator-safety",
  "paperboy://docs/dns",
  "paperboy://docs/templates",
  "paperboy://docs/broadcasts",
  "paperboy://docs/worker",
  "paperboy://docs/webhooks",
  "paperboy://docs/feedback",
  "paperboy://docs/suppressions",
  "paperboy://docs/audiences",
  "paperboy://docs/rate-limits",
] as const;

type PaperBoyMcpDependencies = {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  audiences: PaperBoyMcpAudienceServices;
  broadcasts: PaperBoyMcpBroadcastServices;
  deliveries: PaperBoyMcpDeliveryServices;
  domains: PaperBoyMcpDomainServices;
  emails: PaperBoyMcpEmailServices;
  feedback: PaperBoyMcpFeedbackServices;
  findOrganization: (orgId: string) => Promise<OrganizationRecord | null>;
  now?: () => Date;
  rateLimits: PaperBoyMcpRateLimitServices;
  suppressions: PaperBoyMcpSuppressionServices;
  templates: PaperBoyMcpTemplateServices;
  webhooks: PaperBoyMcpWebhookServices;
};

const emptyInputSchema = z.object({}).strict();

const capabilityOutputSchema = z.object({
  generatedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  resources: z.array(
    z.object({
      description: z.string(),
      uri: z.string(),
    }),
  ),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  tools: z.array(
    z.object({
      description: z.string(),
      mutating: z.boolean(),
      name: z.string(),
      schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
    }),
  ),
  transports: z.array(z.enum(["streamable-http", "stdio"])),
});

const accountContextOutputSchema = z.object({
  credential: z.object({
    environment: z.enum(["live", "test"]),
  }),
  observedAt: z.iso.datetime({ offset: true }),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
  }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
});

const toolAnnotations = {
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
  readOnlyHint: true,
} as const;

const toolDefinitions = [
  {
    description:
      "List the MCP tools, resources, transports, and schema versions available in this PaperBoy build.",
    mutating: false,
    name: PAPERBOY_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Read the organization and live/test environment bound to the authenticated PaperBoy API key.",
    mutating: false,
    name: PAPERBOY_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  ...PAPERBOY_AUDIENCE_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_RATE_LIMIT_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_DELIVERY_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_FEEDBACK_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_WEBHOOK_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_BROADCAST_MCP_TOOL_DEFINITIONS,
  ...PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS,
] as const;

const resourceDefinitions = [
  {
    description: "Configure PaperBoy's Streamable HTTP and stdio transports.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[0],
  },
  {
    description: "Operate PaperBoy safely through an agent.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[1],
  },
  {
    description: "Publish and verify PaperBoy SPF and DMARC records.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[2],
  },
  {
    description: "Create and send safe PaperBoy email templates.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[3],
  },
  {
    description: "Create, inspect, pause, resume, and cancel broadcasts.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[4],
  },
  {
    description: "Operate and inspect the durable outbound worker.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[5],
  },
  {
    description: "Configure and verify signed outbound webhooks.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[6],
  },
  {
    description: "Ingest bounces and complaints without resending mail.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[7],
  },
  {
    description: "Manage the organization suppression list safely.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[8],
  },
  {
    description: "Manage permission-based audiences, contacts, and unsubscribe state.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[9],
  },
  {
    description: "Inspect and manage shared organization send-rate limits.",
    uri: PAPERBOY_MCP_RESOURCE_URIS[10],
  },
] as const;

const configurationDocument = `# PaperBoy MCP configuration

- Remote agents use Streamable HTTP at \`/api/mcp\` with \`Authorization: Bearer <PaperBoy API key>\`.
- Local agents launch \`pnpm mcp:stdio\` with \`DATABASE_URL\`, \`PAPERBOY_API_KEY\`, \`PAPERBOY_PUBLIC_URL\`, \`PAPERBOY_UNSUBSCRIBE_SIGNING_KEY\`, and other feature secrets injected through the process environment.
- Never put an API key in a tool argument, URL, command-line argument, source file, or diagnostic log.
- A key is bound to one organization and one environment (\`live\` or \`test\`).
- Audience and contact tools derive organization context from that key and never accept an organization ID.
- Domain mutations re-check the key creator's current organization role.
- Template CRUD re-checks the key creator's current organization role. Sending an existing template is authorized by the active organization-bound API key.
- Template preview renders sample JSON and reports missing required variables without queueing or sending a message.
- Broadcast tools send one template to a stored audience snapshot, add signed unsubscribe links, check organization suppressions before every enqueue, and expose progress without returning recipient data.
- DKIM tools return public DNS material only. PaperBoy private keys remain encrypted at rest and never enter tool output.
- paperboy_send_email and paperboy_send_email_batch use the same validation, domain authorization, and queue services as their HTTP peers. Single-send idempotencyKey values are scoped to the authenticated API key for 24 hours using PostgreSQL UTC instants; identical replays return the original message without another SMTP or Cloudflare submission. Single sends can persist private attachments outside PostgreSQL; batch sends reject them. Tool output never includes attachment content. Test keys always select the test sink; batch results preserve input order and report failures per item.
- paperboy_list_delivery_statuses accepts optional status, domainId, createdAtFrom, createdAtBefore, and limit filters. Date bounds are RFC 3339 UTC instants; tenant and environment always come from the key.
- paperboy_list_message_events returns the same tenant- and environment-scoped ordered timeline as GET /api/v1/emails/:id/events. Delivery status and event tools omit recipients, content, event data, provider payloads, and raw MIME. Owner-only reconstructed MIME remains an explicit console download.
- paperboy_get_webhook and paperboy_configure_webhook manage one organization webhook without accepting an organization ID. A new signing secret is returned only on first creation and is never returned by reads.
- paperboy_ingest_feedback accepts a bounded Base64 DSN or ARF, correlates only within the authenticated organization, and never sends a test message.
- Suppression CRUD and CSV import use the same organization blocklist checked before HTTP, MCP, batch, broadcast, SMTP, or Cloudflare delivery can be queued.
- Broadcast creation accepts an audience ID, snapshots active contacts, and adds a PaperBoy-signed unsubscribe URL before the provider-neutral queue.
- Live and test API keys share separate organization-wide PostgreSQL rate-limit windows. Read or update overrides with the rate-limit tools; send tools report rate_limit_exceeded with an exact retry delay.
- Send tools accept either inline subject/body fields or \`template_id\` plus a JSON \`data\` object. Template rendering finishes before provider delivery, so SMTP and Cloudflare Email Sending receive the same rendered subject, HTML, and text.
- Cloudflare Email Routing keeps its own selectors and shares one merged root SPF record. Cloudflare Email Sending owns its DKIM signature; do not pass it a PaperBoy-signed message.
- HTTP authentication is checked on every request. Stdio authentication is checked at startup and again for every tool call.
- Revocation denies the next authenticated HTTP request or stdio tool call. Reconnect with a newly issued key.
`;

const operatorSafetyDocument = `# PaperBoy MCP operator safety

- Treat console, HTTP, and MCP as peer interfaces over the same domain services and authorization rules.
- Do not ask for or pass an organization ID when the key already supplies tenant context.
- Keep stored instants and protocol timestamps in RFC 3339 UTC. Convert only for presentation using an explicit IANA timezone.
- Read state before future mutating tools, preserve idempotency keys, and require human confirmation for destructive operations.
- Tool errors must not expose API keys, secrets, message content, or another organization's state.
- Respect rate_limit_exceeded and its retry delay. Retrying early cannot bypass the organization-wide counter.
- Broadcast cancellation is irreversible. Read progress first and pass explicit confirmation through MCP.
`;

const templateDocument = `# PaperBoy email templates

- Templates belong to the organization bound to the API key. Never pass an organization ID to a template tool.
- A template stores a name, subject, at least one of HTML or plain text, and an explicit list of required variable paths.
- Variables use dotted double-brace paths such as \`{{reader.name}}\`.
- Helpers, sections, expressions, triple braces, and executable template code are rejected.
- Values inserted into HTML are escaped. Subject and plain-text values are interpolated as text.
- Missing optional variables render as empty text. Preview lists missing required variables; sending fails until all required values are supplied.
- Use paperboy_preview_template to render sample JSON without queueing or sending mail.
- Queue email with \`template_id\` and an optional JSON \`data\` object. Do not combine those fields with inline subject, HTML, or text.
- Rendering happens before provider delivery, so Cloudflare Email Sending and SMTP receive the same content.
- Read a template before deleting it, then pass \`confirm: true\` to paperboy_delete_template.
- Stored instants and MCP timestamps are UTC. Console presentation uses each user's IANA timezone.
`;

const broadcastDocument = `# PaperBoy broadcasts

- Broadcasts belong to the organization bound to the API key. Never pass an organization ID.
- Create accepts one stored template and one tenant-owned audience ID containing 1-100 active contacts.
- PaperBoy snapshots the template and active contacts, appends a signed unsubscribe link when missing, checks the per-organization suppression table before each enqueue, and never injects an open-tracking pixel.
- Template data contains name, email, contact.name, contact.email, and unsubscribe_url. Opening the link is read-only; the recipient confirms before PaperBoy records the opt-out.
- Progress separates pending, processing, queued, suppressed, failed, and cancelled recipients. Tool output never returns audience addresses or rendered message content.
- Pause stops before the next recipient. Resume processes remaining recipients. Cancel marks every pending recipient cancelled and prevents further claims; an already-processing recipient may finish.
- Queue records remain provider-neutral. SMTP and Cloudflare Email Sending receive the same rendered subject, HTML, and text through the normal worker path.
- Stored instants and MCP timestamps are UTC. Console presentation uses each user's IANA timezone.
`;

const workerDocument = `# PaperBoy outbound worker

- Run 'pnpm worker' beside every web deployment. The PostgreSQL queue is the source of truth.
- Set SMTP_URL to an smtp:// or smtps:// submission endpoint to enable live delivery. Without it, the worker consumes test-sink messages only and leaves live rows queued.
- SMTP_TLS_MODE defaults to required. smtp:// must negotiate STARTTLS; opportunistic and disabled are weaker opt-ins for controlled environments. smtps:// uses implicit TLS.
- For local capture, run 'docker compose -f compose.dev.yml up --wait mailpit', use SMTP_URL=smtp://127.0.0.1:1025 with SMTP_TLS_MODE=disabled, and inspect http://127.0.0.1:8025.
- Cloudflare Email Service works through the same adapter with smtps://api_token:<URL-encoded API token>@smtp.mx.cloudflare.net:465 and required TLS. Keep the token in the worker secret environment, never MCP arguments or output. Cloudflare remains its own DKIM/ARC signing authority.
- A worker atomically claims an eligible message, records 'sending', and holds a five-minute lease. If it exits mid-delivery, another worker can reclaim the same row after the lease expires.
- Delivery is at least once. A process exit after a provider accepts a message but before PostgreSQL records 'sent' can cause a duplicate, so preserve send idempotency where the provider supports it.
- Retry transient network failures, HTTP 5xx, and SMTP 4xx with bounded backoff. SMTP 550 and other permanent failures move directly to 'failed'. Five attempts exhaust the retry budget.
- Failure codes and reasons are sanitized before storage. Message bodies, addresses, attachments, credentials, and provider responses never appear in MCP status output.
- Use paperboy_list_delivery_statuses and paperboy_get_delivery_status to inspect queued, sending, sent, and failed records. The list supports status, domainId, and RFC 3339 UTC creation bounds while retaining key-derived tenant and environment scope. Use paperboy_list_message_events for the ordered queued, delivered, bounced, complained, and opted-in opened timeline. Opened events cannot exist unless that message persisted tracking opt-in. MCP timestamps remain RFC 3339 UTC, and these tools never return MIME or provider-owned Cloudflare DKIM/ARC material.
- The worker hands the same rendered semantic message to every adapter. SMTP builds MIME at delivery time; Cloudflare Email Sending receives structured, unsigned fields and remains its own signing authority.
- The same process also sends queued webhooks. Supply the same PAPERBOY_WEBHOOK_ENCRYPTION_KEY to every web and worker process that configures or delivers webhooks; without it, webhook rows remain queued.
`;

const webhookDocument = `# PaperBoy signed webhooks

- Configure one organization endpoint with PUT /api/v1/webhooks or paperboy_configure_webhook. The generated whsec_ signing secret is shown only in the first successful response; store it immediately in the receiver's secret manager.
- Production endpoints must use HTTPS. Plain HTTP is accepted only for loopback development receivers outside production.
- Each POST uses webhook-id, webhook-timestamp, and webhook-signature headers. Verify HMAC-SHA256 over the exact raw UTF-8 bytes of id.timestamp.body with the Base64-decoded part after whsec_. Reject stale timestamps before parsing JSON.
- The webhook ID is the stable message-event ID and does not change across retries. Timestamp and signature are regenerated for each attempt.
- Any 2xx response completes delivery. Network failures and 5xx responses retry after one minute, five minutes, thirty minutes, and two hours; other responses fail without retry. Five attempts exhaust the queue.
- Event bodies contain type, created_at in RFC 3339 UTC, data.email_id, and data.environment. They omit recipients, subject, content, attachments, credentials, and provider payloads. SMTP, Cloudflare Email Service, and future adapters share this event path.
- Keep stored instants and protocol timestamps in UTC. Convert only receiver presentation with an explicit IANA timezone.
`;

const feedbackDocument = `# PaperBoy bounce and complaint ingestion

- Use paperboy_ingest_feedback for one Base64 RFC 3464 delivery-status report or RFC 5965 abuse feedback report. The API key creator must remain an organization owner or admin.
- PaperBoy accepts at most 10 MiB, stores no raw report, and correlates explicit envelope, X-PaperBoy-Message-ID, or Message-ID UUIDs plus the reported recipient to a message in the authenticated organization.
- Prefer header-only reports. Raw reports are untrusted and may contain original content; pass them only through the authenticated tool transport, never a prompt, URL, log, or command argument.
- A 5.x.x failed DSN is a hard bounce and creates a bounced event plus a bounced suppression. A 4.x.x delayed or failed DSN is a soft bounce and creates an event without suppression. An ARF complaint creates a complained event plus a complained suppression.
- Exact report replays are idempotent. Future single, batch, broadcast, HTTP, and MCP sends re-check suppressions and return recipient_suppressed without queueing mail.
- The Postfix pipe uses pnpm feedback:ingest with a protected API key file. It reads raw RFC 822 bytes from stdin and never sends mail to test an address.
- Cloudflare Email Sending owns its cf-bounce return path and provider suppression pipeline. Do not replace it. PaperBoy feedback ingestion remains available for reports routed to PaperBoy, while Cloudflare SMTP delivery continues through the same provider-neutral message-event and webhook path.
- Ingestion and MCP timestamps are RFC 3339 UTC. Convert only presentation with an explicit IANA timezone.
`;

const suppressionDocument = `# PaperBoy suppression list

- Suppressions belong to the organization bound to the API key. Never pass an organization ID to a suppression tool.
- paperboy_list_suppressions and paperboy_get_suppression are available to current members. Create, update, delete, and import require an owner or admin.
- Reasons are manual, unsubscribed, bounced, or complained. The send path returns recipient_suppressed with the reason before inserting a queue row, so the address never reaches SMTP or Cloudflare Email Sending.
- CSV import accepts UTF-8 with an email header and optional reason column, at most 1 MiB and 5,000 data rows. The entire file validates before mutation. Duplicate rows and existing entries keep the strongest reason: complained, then bounced, then unsubscribed, then manual.
- Read a suppression before deleting it and pass confirm: true. Deletion means the address may receive future mail; it does not modify Cloudflare provider suppressions.
- PaperBoy suppression state is provider-neutral and complements, but does not replace, the Cloudflare-managed cf-bounce and provider suppression pipeline.
- Stored instants and MCP timestamps are RFC 3339 UTC. Console presentation uses each signed-in user's persisted IANA timezone.
`;

const audienceDocument = `# PaperBoy audiences and contacts

- Audiences and contacts belong to the organization bound to the API key. Never pass an organization ID.
- Current members can list and read. Owners and admins create, rename, delete, and import.
- Each audience contains at most 100 contacts. CSV import accepts UTF-8 with an email header and optional name column, at most 1 MiB and 100 data rows. The complete file validates before mutation.
- Import only contacts who gave the sender permission. PaperBoy does not provide a purchased-list marketplace.
- paperboy_create_broadcast accepts audienceId, snapshots only active contacts, and appends a signed unsubscribe link when the template omitted one. Template data includes name, email, contact, and unsubscribe_url.
- Opening an unsubscribe URL is read-only. The recipient must confirm; confirmation sets unsubscribed_at and creates an organization-wide unsubscribed suppression atomically.
- PaperBoy links are HMAC-SHA256 signed with PAPERBOY_UNSUBSCRIBE_SIGNING_KEY and have no provider dependency. SMTP and Cloudflare Email Sending receive the same rendered link and body.
- Cloudflare keeps its independent cf-bounce return path and provider suppression pipeline. PaperBoy unsubscribe state complements it and blocks before provider queue insertion.
- Stored instants and MCP timestamps are RFC 3339 UTC. Console presentation uses each signed-in user's persisted IANA timezone.
`;

const rateLimitDocument = `# PaperBoy organization send-rate limits

- Every accepted message consumes one PostgreSQL counter slot for the organization and API-key environment, regardless of which API key, web process, REST route, MCP transport, batch, or broadcast created it.
- The default caps are PAPERBOY_LIVE_RATE_LIMIT_PER_MINUTE=60 and PAPERBOY_TEST_RATE_LIMIT_PER_MINUTE=600. Both must be whole numbers and the test cap must be higher.
- Current members can read effective settings. Owners and admins can set an organization override or pass null to restore an operator default. Tools never accept an organization ID.
- Windows are fixed UTC minutes. A rejected single send returns rate_limit_exceeded with environment, limit, and retryAfterSeconds. HTTP peers return 429 and the same delay in Retry-After.
- Validation failures, suppressions, attachment-storage rollbacks, and idempotent replays do not consume a slot. Parallel inserts serialize on one organization-and-environment counter row.
- A broadcast pauses with its unprocessed recipient still pending when the cap is reached. Resume it after the reported window has reset.
- Rate limiting happens before the provider queue, so SMTP and Cloudflare Email Sending have identical behavior.
`;

function authorizationError() {
  return {
    content: [
      {
        text: "Authorization failed. Reconnect with a valid PaperBoy API key.",
        type: "text" as const,
      },
    ],
    isError: true,
  };
}

export function createPaperBoyMcpServer(
  dependencies: PaperBoyMcpDependencies,
): McpServer {
  const now = dependencies.now ?? (() => new Date());

  async function resolveAccount() {
    const principal = await dependencies.authorize();

    if (!principal) {
      return null;
    }

    const organization = await dependencies.findOrganization(principal.orgId);

    if (!organization) {
      return null;
    }

    return { organization, principal };
  }

  const server = new McpServer(
    { name: "paperboy", version: PAPERBOY_MCP_VERSION },
    {
      instructions:
        "PaperBoy operations are bound to the organization and environment on the authenticated API key. Protocol timestamps are UTC. Never request or expose the API key in tool arguments or output.",
    },
  );

  server.registerTool(
    PAPERBOY_MCP_TOOL_NAMES[0],
    {
      annotations: toolAnnotations,
      description: toolDefinitions[0].description,
      inputSchema: emptyInputSchema,
      outputSchema: capabilityOutputSchema,
      title: "List PaperBoy capabilities",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const account = await resolveAccount();

      if (!account) {
        return authorizationError();
      }

      const output = {
        generatedAt: protocolTimestamp(now()),
        protocolTimeZone: "UTC" as const,
        resources: resourceDefinitions.map((resource) => ({ ...resource })),
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        tools: toolDefinitions.map((tool) => ({ ...tool })),
        transports: ["streamable-http", "stdio"] as const,
      };

      return {
        content: [
          { text: JSON.stringify(output, null, 2), type: "text" as const },
        ],
        structuredContent: output,
      };
    },
  );

  server.registerTool(
    PAPERBOY_MCP_TOOL_NAMES[1],
    {
      annotations: toolAnnotations,
      description: toolDefinitions[1].description,
      inputSchema: emptyInputSchema,
      outputSchema: accountContextOutputSchema,
      title: "Get PaperBoy account context",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const account = await resolveAccount();

      if (!account) {
        return authorizationError();
      }

      const output = {
        credential: { environment: account.principal.environment },
        observedAt: protocolTimestamp(now()),
        organization: account.organization,
        protocolTimeZone: "UTC" as const,
        schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
      };

      return {
        content: [
          { text: JSON.stringify(output, null, 2), type: "text" as const },
        ],
        structuredContent: output,
      };
    },
  );

  for (const [resource, text] of [
    [resourceDefinitions[0], configurationDocument],
    [resourceDefinitions[1], operatorSafetyDocument],
    [resourceDefinitions[2], DNS_OPERATOR_GUIDE],
    [resourceDefinitions[3], templateDocument],
    [resourceDefinitions[4], broadcastDocument],
    [resourceDefinitions[5], workerDocument],
    [resourceDefinitions[6], webhookDocument],
    [resourceDefinitions[7], feedbackDocument],
    [resourceDefinitions[8], suppressionDocument],
    [resourceDefinitions[9], audienceDocument],
    [resourceDefinitions[10], rateLimitDocument],
  ] as const) {
    server.registerResource(
      resource.uri,
      resource.uri,
      {
        description: resource.description,
        mimeType: "text/markdown",
        title: resource.description,
      },
      async (uri) => {
        const account = await resolveAccount();

        if (!account) {
          throw new Error("Authorization failed.");
        }

        return {
          contents: [
            {
              mimeType: "text/markdown",
              text,
              uri: uri.href,
            },
          ],
        };
      },
    );
  }

  registerPaperBoyAudienceTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.audiences,
  });

  registerPaperBoyEmailTools({
    authorize: dependencies.authorize,
    server,
    services: dependencies.emails,
  });

  registerPaperBoyRateLimitTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.rateLimits,
  });

  registerPaperBoyDeliveryTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.deliveries,
  });

  registerPaperBoyFeedbackTools({
    authorize: dependencies.authorize,
    server,
    services: dependencies.feedback,
  });

  registerPaperBoySuppressionTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.suppressions,
  });

  registerPaperBoyWebhookTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.webhooks,
  });

  registerPaperBoyTemplateTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.templates,
  });

  registerPaperBoyBroadcastTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.broadcasts,
  });

  registerPaperBoyDomainTools({
    authorize: dependencies.authorize,
    now,
    server,
    services: dependencies.domains,
  });

  return server;
}
