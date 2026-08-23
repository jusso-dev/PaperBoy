import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  MAX_RATE_LIMIT_PER_MINUTE,
  RateLimitConfigurationError,
  RateLimitSettingsError,
  type RateLimitSettings,
} from "@/lib/rate-limit-core";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_RATE_LIMIT_MCP_TOOL_NAMES = [
  "paperboy_get_rate_limits",
  "paperboy_update_rate_limits",
] as const;

export const PAPERBOY_RATE_LIMIT_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "Read the authenticated organization's effective live and test send caps and their defaults.",
    mutating: false,
    name: PAPERBOY_RATE_LIMIT_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Set or clear the authenticated organization's live and test per-minute send overrides.",
    mutating: true,
    name: PAPERBOY_RATE_LIMIT_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpRateLimitServices = {
  get: (principal: ApiKeyPrincipal) => Promise<RateLimitSettings>;
  update: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<RateLimitSettings>;
};

const limit = z.number().int().min(1).max(MAX_RATE_LIMIT_PER_MINUTE);
const updateInputSchema = z
  .object({
    liveLimitPerMinute: limit.nullable().optional(),
    testLimitPerMinute: limit.nullable().optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.liveLimitPerMinute !== undefined ||
      value.testLimitPerMinute !== undefined,
    { message: "Provide a live or test override; use null to restore its default." },
  );

const settingsSchema = z.object({
  defaultLiveLimitPerMinute: limit,
  defaultTestLimitPerMinute: limit,
  liveLimitPerMinute: limit,
  liveOverridePerMinute: limit.nullable(),
  testLimitPerMinute: limit,
  testOverridePerMinute: limit.nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const outputSchema = z.object({
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  settings: settingsSchema,
});

function serialize(settings: RateLimitSettings) {
  return {
    defaultLiveLimitPerMinute: settings.defaultLiveLimitPerMinute,
    defaultTestLimitPerMinute: settings.defaultTestLimitPerMinute,
    liveLimitPerMinute: settings.liveLimitPerMinute,
    liveOverridePerMinute: settings.liveOverridePerMinute,
    testLimitPerMinute: settings.testLimitPerMinute,
    testOverridePerMinute: settings.testOverridePerMinute,
    updatedAt: protocolTimestamp(settings.updatedAt),
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
  let message = "The rate-limit settings operation failed.";
  if (error instanceof AuthorizationError) {
    message =
      "The API key creator's current role does not allow this rate-limit change.";
  } else if (error instanceof RateLimitSettingsError) {
    message =
      error.code === "MEMBERSHIP_REQUIRED"
        ? "Create a new API key from a current organization member."
        : error.issues[0]?.message ?? "Check the rate-limit settings.";
  } else if (error instanceof RateLimitConfigurationError) {
    message =
      "The operator must correct PaperBoy's live and test rate-limit defaults.";
  } else {
    console.error("PaperBoy MCP rate-limit settings operation failed.");
  }
  return {
    content: [{ text: message, type: "text" as const }],
    isError: true,
  };
}

function success(settings: RateLimitSettings, now: Date) {
  const output = {
    observedAt: protocolTimestamp(now),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
    settings: serialize(settings),
  };
  return {
    content: [{ text: JSON.stringify(output, null, 2), type: "text" as const }],
    structuredContent: output,
  };
}

export function registerPaperBoyRateLimitTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpRateLimitServices;
}) {
  const now = input.now ?? (() => new Date());
  input.server.registerTool(
    PAPERBOY_RATE_LIMIT_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_RATE_LIMIT_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z.object({}).strict(),
      outputSchema,
      title: "Get PaperBoy rate limits",
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
    PAPERBOY_RATE_LIMIT_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_RATE_LIMIT_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: updateInputSchema,
      outputSchema,
      title: "Update PaperBoy rate limits",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ liveLimitPerMinute, testLimitPerMinute }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();
      const payload: Record<string, number | null> = {};
      if (liveLimitPerMinute !== undefined) {
        payload.live_limit_per_minute = liveLimitPerMinute;
      }
      if (testLimitPerMinute !== undefined) {
        payload.test_limit_per_minute = testLimitPerMinute;
      }
      try {
        return success(await input.services.update(principal, payload), now());
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
