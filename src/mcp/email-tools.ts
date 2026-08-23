import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { DomainError } from "@/lib/domain-core";
import { EmailError } from "@/lib/email-core";
import type {
  QueuedMessageBatchItem,
  QueuedMessageRecord,
} from "@/lib/messages";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_EMAIL_MCP_TOOL_NAMES = [
  "paperboy_send_email",
  "paperboy_send_email_batch",
] as const;

export const PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "Validate and queue one transactional email for the authenticated organization and API-key environment.",
    mutating: true,
    name: PAPERBOY_EMAIL_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Validate and queue up to 100 transactional emails, preserving input order and reporting failures per item.",
    mutating: true,
    name: PAPERBOY_EMAIL_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpEmailServices = {
  queue: (
    principal: ApiKeyPrincipal,
    payload: unknown,
    idempotencyKey?: unknown,
  ) => Promise<QueuedMessageRecord>;
  queueBatch: (
    principal: ApiKeyPrincipal,
    payloads: unknown[],
  ) => Promise<QueuedMessageBatchItem[]>;
};

const address = z.string().min(1).max(320);
const tag = z
  .object({
    name: z.string().min(1).max(256),
    value: z.string().min(1).max(256),
  })
  .strict();

const sendEmailPayloadSchema = z
  .object({
    from: address,
    html: z.string().max(2 * 1024 * 1024).optional(),
    subject: z.string().min(1).max(998),
    tags: z.array(tag).max(75).optional(),
    text: z.string().max(2 * 1024 * 1024).optional(),
    to: z.union([address, z.array(address).min(1).max(50)]),
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

const sendEmailBatchInputSchema = z
  .object({
    emails: z.array(sendEmailPayloadSchema).min(1).max(100),
  })
  .strict();

const queuedEmailOutputShape = {
  deliveryMode: z.enum(["live", "test-sink"]),
  environment: z.enum(["live", "test"]),
  id: z.string().uuid(),
  queuedAt: z.iso.datetime({ offset: true }),
  replayed: z.boolean(),
  status: z.enum(["queued", "sending", "sent", "failed"]),
};

const sendEmailOutputSchema = z.object({
  deliveryMode: queuedEmailOutputShape.deliveryMode,
  environment: queuedEmailOutputShape.environment,
  id: queuedEmailOutputShape.id,
  protocolTimeZone: z.literal("UTC"),
  queuedAt: queuedEmailOutputShape.queuedAt,
  replayed: queuedEmailOutputShape.replayed,
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  status: queuedEmailOutputShape.status,
});

const sendEmailBatchOutputSchema = z.object({
  data: z.array(
    z.union([
      z.object({
        ...queuedEmailOutputShape,
        index: z.number().int().min(0).max(99),
      }),
      z.object({
        error: z.object({
          code: z.string(),
          fields: z
            .array(z.object({ field: z.string(), message: z.string() }))
            .optional(),
          message: z.string(),
        }),
        index: z.number().int().min(0).max(99),
      }),
    ]),
  ),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
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

function errorDetails(error: unknown) {
  let details: {
    code: string;
    fields?: { field: string; message: string }[];
    message: string;
  } = {
    code: "internal_error",
    message: "The email could not be queued.",
  };

  if (error instanceof EmailError) {
    details =
      error.code === "IDEMPOTENCY_CONFLICT"
        ? {
            code: "idempotency_conflict",
            message:
              "This idempotency key was already used with a different request.",
          }
        : {
            code: "validation_error",
            fields: error.issues,
            message: "Correct the invalid email fields and try again.",
          };
  } else if (error instanceof DomainError) {
    details = {
      code:
        error.code === "INVALID_DOMAIN"
          ? "invalid_from_domain"
          : "domain_not_verified",
      message:
        error.code === "INVALID_DOMAIN"
          ? "The From address must use a valid sending domain."
          : "Verify the From domain before sending with a live API key.",
    };
  }

  return details;
}

function errorResult(error: unknown) {
  const details = errorDetails(error);

  return {
    content: [{ text: details.message, type: "text" as const }],
    isError: true,
  };
}

function queuedOutput(message: QueuedMessageRecord) {
  return {
    deliveryMode: message.deliveryMode,
    environment: message.environment,
    id: message.id,
    queuedAt: protocolTimestamp(message.createdAt),
    replayed: message.replayed,
    status: message.status,
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
          ...queuedOutput(message),
          protocolTimeZone: "UTC" as const,
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
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

  input.server.registerTool(
    PAPERBOY_EMAIL_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: PAPERBOY_EMAIL_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: sendEmailBatchInputSchema,
      outputSchema: sendEmailBatchOutputSchema,
      title: "Queue a PaperBoy email batch",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ emails }) => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      const batch = await input.services.queueBatch(principal, emails);
      const output = {
        data: batch.map((item, index) =>
          item.ok
            ? { ...queuedOutput(item.message), index }
            : { error: errorDetails(item.error), index },
        ),
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
}
