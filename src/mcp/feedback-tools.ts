import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  decodeFeedbackReportBase64,
  FeedbackError,
  MAX_FEEDBACK_REPORT_BASE64_LENGTH,
} from "@/lib/feedback-core";
import type { FeedbackIngestionResult } from "@/lib/feedback";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_FEEDBACK_MCP_TOOL_NAMES = [
  "paperboy_ingest_feedback",
] as const;

export const PAPERBOY_FEEDBACK_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "Ingest one Base64 RFC 3464 DSN or RFC 5965 ARF for the authenticated organization, creating correlated events and permanent suppressions.",
    mutating: true,
    name: PAPERBOY_FEEDBACK_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpFeedbackServices = {
  ingest: (
    principal: ApiKeyPrincipal,
    raw: Buffer,
  ) => Promise<FeedbackIngestionResult[]>;
};

const outputSchema = z.object({
  data: z.array(
    z.object({
      classification: z.enum(["hard_bounce", "soft_bounce", "complaint"]),
      eventId: z.string().uuid(),
      ingestedAt: z.iso.datetime({ offset: true }),
      messageId: z.string().uuid(),
      replayed: z.boolean(),
      suppressed: z.boolean(),
    }),
  ),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
});

function errorResult(error: unknown) {
  let message = "The feedback report could not be ingested.";

  if (error instanceof AuthorizationError) {
    message =
      "The API key creator's current role does not allow feedback ingestion.";
  } else if (error instanceof FeedbackError) {
    switch (error.code) {
      case "MEMBERSHIP_REQUIRED":
        message = "Create a new API key from a current organization admin.";
        break;
      case "REPORT_TOO_LARGE":
        message = "Feedback reports must not exceed 10 MiB.";
        break;
      case "NO_MATCHING_MESSAGE":
        message =
          "Report message IDs and recipients did not match this organization.";
        break;
      default:
        message = "Provide one valid Base64 RFC 3464 DSN or RFC 5965 ARF.";
    }
  } else {
    console.error("PaperBoy MCP feedback ingestion failed.");
  }

  return { content: [{ text: message, type: "text" as const }], isError: true };
}

export function registerPaperBoyFeedbackTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  server: McpServer;
  services: PaperBoyMcpFeedbackServices;
}) {
  input.server.registerTool(
    PAPERBOY_FEEDBACK_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_FEEDBACK_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z
        .object({
          rawReportBase64: z
            .string()
            .min(1)
            .max(MAX_FEEDBACK_REPORT_BASE64_LENGTH),
        })
        .strict(),
      outputSchema,
      title: "Ingest PaperBoy delivery feedback",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ rawReportBase64 }) => {
      const principal = await input.authorize();

      if (!principal) {
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

      try {
        const results = await input.services.ingest(
          principal,
          decodeFeedbackReportBase64(rawReportBase64),
        );
        const output = {
          data: results.map((result) => ({
            classification: result.classification,
            eventId: result.eventId,
            ingestedAt: protocolTimestamp(result.createdAt),
            messageId: result.messageId,
            replayed: result.replayed,
            suppressed: result.suppressed,
          })),
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
}
