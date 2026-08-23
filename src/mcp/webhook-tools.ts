import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import { protocolTimestamp } from "@/lib/time";
import {
  WebhookError,
  WEBHOOK_URL_MAX_LENGTH,
} from "@/lib/webhook-core";
import type {
  WebhookConfigurationResult,
  WebhookEndpointRecord,
} from "@/lib/webhooks";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_WEBHOOK_MCP_TOOL_NAMES = [
  "paperboy_get_webhook",
  "paperboy_configure_webhook",
] as const;

export const PAPERBOY_WEBHOOK_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "Read the authenticated organization's single outbound webhook URL without exposing its signing secret.",
    mutating: false,
    name: PAPERBOY_WEBHOOK_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Configure the authenticated organization's outbound webhook URL; a newly generated signing secret is returned only on first creation.",
    mutating: true,
    name: PAPERBOY_WEBHOOK_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpWebhookServices = {
  configure: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<WebhookConfigurationResult>;
  get: (principal: ApiKeyPrincipal) => Promise<WebhookEndpointRecord | null>;
};

const webhookSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
  updatedAt: z.iso.datetime({ offset: true }),
  url: z.string(),
});

const metadataSchema = {
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
};

const getWebhookOutputSchema = z.object({
  ...metadataSchema,
  webhook: webhookSchema.nullable(),
});

const configureWebhookOutputSchema = z.object({
  ...metadataSchema,
  signingSecret: z.string().nullable(),
  webhook: webhookSchema,
});

function serialize(endpoint: WebhookEndpointRecord) {
  return {
    createdAt: protocolTimestamp(endpoint.createdAt),
    id: endpoint.id,
    updatedAt: protocolTimestamp(endpoint.updatedAt),
    url: endpoint.url,
  };
}

function unauthorizedResult() {
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

function errorResult(error: unknown) {
  let message = "The webhook operation failed.";

  if (error instanceof AuthorizationError) {
    message =
      "The API key creator's current role does not allow webhook configuration.";
  } else if (error instanceof WebhookError) {
    switch (error.code) {
      case "MEMBERSHIP_REQUIRED":
        message = "Create a new API key from a current organization admin.";
        break;
      case "INVALID_INPUT":
      case "INVALID_URL":
        message =
          "Provide one HTTPS webhook URL without embedded credentials or a fragment.";
        break;
      default:
        message =
          "Webhook secret encryption is unavailable. Ask the operator to check PAPERBOY_WEBHOOK_ENCRYPTION_KEY.";
    }
  } else {
    console.error("PaperBoy MCP webhook operation failed.");
  }

  return { content: [{ text: message, type: "text" as const }], isError: true };
}

function successResult(output: Record<string, unknown>) {
  return {
    content: [{ text: JSON.stringify(output, null, 2), type: "text" as const }],
    structuredContent: output,
  };
}

export function registerPaperBoyWebhookTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpWebhookServices;
}) {
  const now = input.now ?? (() => new Date());
  const metadata = () => ({
    observedAt: protocolTimestamp(now()),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  });

  input.server.registerTool(
    PAPERBOY_WEBHOOK_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_WEBHOOK_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z.object({}).strict(),
      outputSchema: getWebhookOutputSchema,
      title: "Get PaperBoy webhook",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const endpoint = await input.services.get(principal);
        return successResult({
          ...metadata(),
          webhook: endpoint ? serialize(endpoint) : null,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_WEBHOOK_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_WEBHOOK_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: z
        .object({ url: z.string().min(1).max(WEBHOOK_URL_MAX_LENGTH) })
        .strict(),
      outputSchema: configureWebhookOutputSchema,
      title: "Configure PaperBoy webhook",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ url }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const configured = await input.services.configure(principal, { url });
        return successResult({
          ...metadata(),
          signingSecret: configured.signingSecret,
          webhook: serialize(configured.endpoint),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
