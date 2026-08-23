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
  PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS,
  PAPERBOY_EMAIL_MCP_TOOL_NAMES,
  registerPaperBoyEmailTools,
  type PaperBoyMcpEmailServices,
} from "@/mcp/email-tools";
import {
  PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS,
  PAPERBOY_TEMPLATE_MCP_TOOL_NAMES,
  registerPaperBoyTemplateTools,
  type PaperBoyMcpTemplateServices,
} from "@/mcp/template-tools";

export { PAPERBOY_MCP_SCHEMA_VERSION, PAPERBOY_MCP_VERSION };

export const PAPERBOY_MCP_TOOL_NAMES = [
  "paperboy_list_capabilities",
  "paperboy_get_account_context",
  ...PAPERBOY_EMAIL_MCP_TOOL_NAMES,
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
] as const;

type PaperBoyMcpDependencies = {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  broadcasts: PaperBoyMcpBroadcastServices;
  domains: PaperBoyMcpDomainServices;
  emails: PaperBoyMcpEmailServices;
  findOrganization: (orgId: string) => Promise<OrganizationRecord | null>;
  now?: () => Date;
  templates: PaperBoyMcpTemplateServices;
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
  ...PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS,
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
] as const;

const configurationDocument = `# PaperBoy MCP configuration

- Remote agents use Streamable HTTP at \`/api/mcp\` with \`Authorization: Bearer <PaperBoy API key>\`.
- Local agents launch \`pnpm mcp:stdio\` with \`DATABASE_URL\`, \`PAPERBOY_API_KEY\`, \`PAPERBOY_DKIM_ENCRYPTION_KEY\`, and the private \`PAPERBOY_ATTACHMENT_STORAGE_PATH\` injected through the process environment.
- Never put an API key in a tool argument, URL, command-line argument, source file, or diagnostic log.
- A key is bound to one organization and one environment (\`live\` or \`test\`).
- Domain mutations re-check the key creator's current organization role.
- Template CRUD re-checks the key creator's current organization role. Sending an existing template is authorized by the active organization-bound API key.
- Template preview renders sample JSON and reports missing required variables without queueing or sending a message.
- Broadcast tools send one template to a bounded audience snapshot, check organization suppressions before every enqueue, and expose progress without returning recipient data.
- DKIM tools return public DNS material only. PaperBoy private keys remain encrypted at rest and never enter tool output.
- paperboy_send_email and paperboy_send_email_batch use the same validation, domain authorization, and queue services as their HTTP peers. Single sends can persist private attachments outside PostgreSQL; batch sends reject them. Tool output never includes attachment content. Test keys always select the test sink; batch results preserve input order and report failures per item.
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
- Create accepts one stored template and 1-100 audience members. Each member supplies an email and optional JSON template data.
- PaperBoy snapshots the template, checks the per-organization suppression table before each enqueue, and never injects an open-tracking pixel.
- Progress separates pending, processing, queued, suppressed, failed, and cancelled recipients. Tool output never returns audience addresses or rendered message content.
- Pause stops before the next recipient. Resume processes remaining recipients. Cancel marks every pending recipient cancelled and prevents further claims; an already-processing recipient may finish.
- Queue records remain provider-neutral. SMTP and Cloudflare Email Sending receive the same rendered subject, HTML, and text through the normal worker path.
- Stored instants and MCP timestamps are UTC. Console presentation uses each user's IANA timezone.
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

  registerPaperBoyEmailTools({
    authorize: dependencies.authorize,
    server,
    services: dependencies.emails,
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
