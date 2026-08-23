import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { DomainError } from "@/lib/domain-core";
import { EmailError } from "@/lib/email-core";
import type { QueuedMessageRecord } from "@/lib/messages";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_EMAIL_MCP_TOOL_NAMES = ["paperboy_send_email"] as const;

export const PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "Validate and queue one transactional email for the authenticated organization and API-key environment.",
    mutating: true,
    name: PAPERBOY_EMAIL_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpEmailServices = {
  queue: (
    principal: ApiKeyPrincipal,
    payload: unknown,
    idempotencyKey?: unknown,
  ) => Promise<QueuedMessageRecord>;
};

const address = z.string().min(1).max(320);
const tag = z
  .object({
    name: z.string().min(1).max(256),
    value: z.string().min(1).max(256),
  })
  .strict();

const sendEmailInputSchema = z
  .object({
    from: address,
    html: z.string().max(2 * 1024 * 1024).optional(),
    idempotencyKey: z.string().min(1).max(256).optional(),
    subject: z.string().min(1).max(998),
    tags: z.array(tag).max(75).optional(),
    text: z.string().max(2 * 1024 * 1024).optional(),
    to: z.union([address, z.array(address).min(1).max(50)]),
  })
  .strict();

const sendEmailOutputSchema = z.object({
  deliveryMode: z.enum(["live", "test-sink"]),
  environment: z.enum(["live", "test"]),
  id: z.string().uuid(),
  protocolTimeZone: z.literal("UTC"),
  queuedAt: z.iso.datetime({ offset: true }),
  replayed: z.boolean(),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  status: z.enum(["queued", "sending", "sent", "failed"]),
});

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
  let message = "The email could not be queued.";

  if (error instanceof EmailError) {
    message =
      error.code === "IDEMPOTENCY_CONFLICT"
        ? "This idempotency key was already used with a different request."
        : error.issues
            .map((issue) => `${issue.field}: ${issue.message}`)
            .join(" ");
  } else if (error instanceof DomainError) {
    message =
      error.code === "INVALID_DOMAIN"
        ? "The From address must use a valid sending domain."
        : "Verify the From domain before sending with a live API key.";
  }

  return {
    content: [{ text: message, type: "text" as const }],
    isError: true,
  };
}

export function registerPaperBoyEmailTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  server: McpServer;
  services: PaperBoyMcpEmailServices;
}) {
  input.server.registerTool(
    PAPERBOY_EMAIL_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: sendEmailInputSchema,
      outputSchema: sendEmailOutputSchema,
      title: "Queue a PaperBoy email",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ idempotencyKey, ...payload }) => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      try {
        const message = await input.services.queue(
          principal,
          payload,
          idempotencyKey,
        );
        const output = {
          deliveryMode: message.deliveryMode,
          environment: message.environment,
          id: message.id,
          protocolTimeZone: "UTC" as const,
          queuedAt: protocolTimestamp(message.createdAt),
          replayed: message.replayed,
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
          status: message.status,
        };

        return {
          content: [
            { text: JSON.stringify(output, null, 2), type: "text" as const },
          ],
          structuredContent: output,
        };
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
