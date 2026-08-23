import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  MESSAGE_EVENT_TYPES,
  type MessageEventRecord,
} from "@/lib/message-event-core";
import {
  MessageStatusError,
  type MessageDeliveryStatusFilters,
  type MessageDeliveryStatusRecord,
} from "@/lib/message-status-core";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_DELIVERY_MCP_TOOL_NAMES = [
  "paperboy_list_delivery_statuses",
  "paperboy_get_delivery_status",
  "paperboy_list_message_events",
] as const;

export const PAPERBOY_DELIVERY_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "List recent delivery states with optional status, domain, and UTC instant filters, without exposing recipients or content.",
    mutating: false,
    name: PAPERBOY_DELIVERY_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Read attempts, retry timing, and any sanitized failure reason for one organization message.",
    mutating: false,
    name: PAPERBOY_DELIVERY_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "List one organization message's ordered lifecycle events without exposing recipients, content, or provider payloads.",
    mutating: false,
    name: PAPERBOY_DELIVERY_MCP_TOOL_NAMES[2],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpDeliveryServices = {
  get: (
    principal: ApiKeyPrincipal,
    messageId: string,
  ) => Promise<MessageDeliveryStatusRecord>;
  list: (
    principal: ApiKeyPrincipal,
    filters: MessageDeliveryStatusFilters & { limit?: number },
  ) => Promise<MessageDeliveryStatusRecord[]>;
  listEvents: (
    principal: ApiKeyPrincipal,
    messageId: string,
  ) => Promise<MessageEventRecord[]>;
};

const deliveryStatusSchema = z.object({
  attemptCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  deliveryMode: z.enum(["live", "test-sink"]),
  domainId: z.string().uuid().nullable(),
  environment: z.enum(["live", "test"]),
  failedAt: z.iso.datetime({ offset: true }).nullable(),
  failureReason: z.string().nullable(),
  id: z.string().uuid(),
  lastAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  lastErrorCode: z.string().nullable(),
  leaseExpiresAt: z.iso.datetime({ offset: true }).nullable(),
  nextAttemptAt: z.iso.datetime({ offset: true }).nullable(),
  provider: z.enum([
    "smtp",
    "cloudflare-email",
    "aws-ses",
    "azure-email",
    "test-sink",
  ]),
  sentAt: z.iso.datetime({ offset: true }).nullable(),
  status: z.enum(["queued", "sending", "sent", "failed"]),
  updatedAt: z.iso.datetime({ offset: true }),
});

const metadataSchema = {
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
};

const deliveryOutputSchema = z.object({
  delivery: deliveryStatusSchema,
  ...metadataSchema,
});

const deliveriesOutputSchema = z.object({
  deliveries: z.array(deliveryStatusSchema),
  ...metadataSchema,
});

const messageEventSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
  messageId: z.string().uuid(),
  type: z.enum(MESSAGE_EVENT_TYPES),
});

const messageEventsOutputSchema = z.object({
  events: z.array(messageEventSchema),
  ...metadataSchema,
});

const deliveryListInputSchema = z
  .object({
    createdAtBefore: z.iso.datetime({ offset: true }).optional(),
    createdAtFrom: z.iso.datetime({ offset: true }).optional(),
    domainId: z.string().uuid().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    status: z.enum(["queued", "sending", "sent", "failed"]).optional(),
  })
  .strict()
  .refine(
    (value) =>
      !value.createdAtFrom ||
      !value.createdAtBefore ||
      new Date(value.createdAtFrom).getTime() <
        new Date(value.createdAtBefore).getTime(),
    {
      message: "createdAtBefore must be later than createdAtFrom.",
      path: ["createdAtBefore"],
    },
  );

function serializeDelivery(record: MessageDeliveryStatusRecord) {
  const timestamp = (value: Date | null) =>
    value ? protocolTimestamp(value) : null;

  return {
    attemptCount: record.attemptCount,
    createdAt: protocolTimestamp(record.createdAt),
    deliveryMode: record.deliveryMode,
    domainId: record.domainId,
    environment: record.environment,
    failedAt: timestamp(record.failedAt),
    failureReason: record.failureReason,
    id: record.id,
    lastAttemptAt: timestamp(record.lastAttemptAt),
    lastErrorCode: record.lastErrorCode,
    leaseExpiresAt: timestamp(record.leaseExpiresAt),
    nextAttemptAt: timestamp(record.nextAttemptAt),
    provider: record.provider,
    sentAt: timestamp(record.sentAt),
    status: record.status,
    updatedAt: protocolTimestamp(record.updatedAt),
  };
}

function serializeEvent(event: MessageEventRecord) {
  return {
    createdAt: protocolTimestamp(event.createdAt),
    id: event.id,
    messageId: event.messageId,
    type: event.type,
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
  let message = "The delivery status operation failed.";

  if (error instanceof AuthorizationError) {
    message =
      "The API key creator's current role does not allow delivery status access.";
  } else if (error instanceof MessageStatusError) {
    message =
      error.code === "MESSAGE_NOT_FOUND"
        ? "No message with that ID exists in this organization."
        : "Create a new API key from a current organization member.";
  } else {
    console.error("PaperBoy MCP delivery status operation failed.");
  }

  return { content: [{ text: message, type: "text" as const }], isError: true };
}

function successResult(output: Record<string, unknown>) {
  return {
    content: [{ text: JSON.stringify(output, null, 2), type: "text" as const }],
    structuredContent: output,
  };
}

export function registerPaperBoyDeliveryTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpDeliveryServices;
}) {
  const now = input.now ?? (() => new Date());
  const metadata = () => ({
    observedAt: protocolTimestamp(now()),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  });
  const annotations = {
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
    readOnlyHint: true,
  } as const;

  input.server.registerTool(
    PAPERBOY_DELIVERY_MCP_TOOL_NAMES[0],
    {
      annotations,
      description: PAPERBOY_DELIVERY_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: deliveryListInputSchema,
      outputSchema: deliveriesOutputSchema,
      title: "List PaperBoy delivery statuses",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ createdAtBefore, createdAtFrom, domainId, limit, status }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const records = await input.services.list(principal, {
          createdAtBefore: createdAtBefore
            ? new Date(createdAtBefore)
            : undefined,
          createdAtFrom: createdAtFrom ? new Date(createdAtFrom) : undefined,
          domainId,
          limit,
          status,
        });
        return successResult({
          deliveries: records.map(serializeDelivery),
          ...metadata(),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DELIVERY_MCP_TOOL_NAMES[1],
    {
      annotations,
      description: PAPERBOY_DELIVERY_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: z.object({ messageId: z.string().uuid() }).strict(),
      outputSchema: deliveryOutputSchema,
      title: "Get a PaperBoy delivery status",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ messageId }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const record = await input.services.get(principal, messageId);
        return successResult({
          delivery: serializeDelivery(record),
          ...metadata(),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DELIVERY_MCP_TOOL_NAMES[2],
    {
      annotations,
      description: PAPERBOY_DELIVERY_MCP_TOOL_DEFINITIONS[2].description,
      inputSchema: z.object({ messageId: z.string().uuid() }).strict(),
      outputSchema: messageEventsOutputSchema,
      title: "List PaperBoy message events",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ messageId }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const records = await input.services.listEvents(principal, messageId);
        return successResult({
          events: records.map(serializeEvent),
          ...metadata(),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
