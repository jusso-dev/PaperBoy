import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  OpenTrackingConfigurationError,
  OpenTrackingSettingsError,
  type OpenTrackingSettings,
} from "@/lib/open-tracking-core";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_OPEN_TRACKING_MCP_TOOL_NAMES = [
  "paperboy_get_open_tracking",
  "paperboy_update_open_tracking",
] as const;

export const PAPERBOY_OPEN_TRACKING_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "Read whether the authenticated organization adds a signed first-party open pixel to future HTML messages.",
    mutating: false,
    name: PAPERBOY_OPEN_TRACKING_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Enable or disable signed first-party open tracking for future HTML messages in the authenticated organization.",
    mutating: true,
    name: PAPERBOY_OPEN_TRACKING_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpOpenTrackingServices = {
  get: (principal: ApiKeyPrincipal) => Promise<OpenTrackingSettings>;
  update: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<OpenTrackingSettings>;
};

const settingsSchema = z.object({
  enabled: z.boolean(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const outputSchema = z.object({
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  settings: settingsSchema,
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
  let message = "The open-tracking settings operation failed.";
  if (error instanceof AuthorizationError) {
    message =
      "The API key creator's current role does not allow this open-tracking change.";
  } else if (error instanceof OpenTrackingSettingsError) {
    message =
      error.code === "MEMBERSHIP_REQUIRED"
        ? "Create a new API key from a current organization member."
        : error.issues[0]?.message ?? "Check the open-tracking setting.";
  } else if (error instanceof OpenTrackingConfigurationError) {
    message =
      "The operator must configure PaperBoy's public URL and dedicated open-tracking signing key.";
  } else {
    console.error("PaperBoy MCP open-tracking settings operation failed.");
  }
  return {
    content: [{ text: message, type: "text" as const }],
    isError: true,
  };
}

function success(settings: OpenTrackingSettings, now: Date) {
  const output = {
    observedAt: protocolTimestamp(now),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
    settings: {
      enabled: settings.enabled,
      updatedAt: protocolTimestamp(settings.updatedAt),
    },
  };
  return {
    content: [{ text: JSON.stringify(output, null, 2), type: "text" as const }],
    structuredContent: output,
  };
}

export function registerPaperBoyOpenTrackingTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpOpenTrackingServices;
}) {
  const now = input.now ?? (() => new Date());
  input.server.registerTool(
    PAPERBOY_OPEN_TRACKING_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_OPEN_TRACKING_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z.object({}).strict(),
      outputSchema,
      title: "Get PaperBoy open tracking",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();
      try {
        return success(await input.services.get(principal), now());
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_OPEN_TRACKING_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_OPEN_TRACKING_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: z.object({ enabled: z.boolean() }).strict(),
      outputSchema,
      title: "Update PaperBoy open tracking",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ enabled }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();
      try {
        return success(
          await input.services.update(principal, { enabled }),
          now(),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
