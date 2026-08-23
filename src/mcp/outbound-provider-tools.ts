import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  OutboundProviderConfigurationError,
  providerConfigurationErrorMessage,
} from "@/lib/outbound-provider-configuration";
import {
  LIVE_OUTBOUND_PROVIDERS,
  type LiveOutboundProvider,
} from "@/lib/outbound-provider-core";
import type { OutboundProviderHttpServices } from "@/lib/outbound-provider-http";
import { OutboundProviderEventError } from "@/lib/outbound-provider-event-core";
import {
  OutboundProviderSettingsError,
  type OutboundProviderSettings,
} from "@/lib/outbound-providers";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES = [
  "paperboy_get_outbound_providers",
  "paperboy_update_outbound_providers",
  "paperboy_test_outbound_provider",
  "paperboy_ingest_outbound_provider_event",
] as const;

export const PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "Read the authenticated organization's default provider, domain overrides, safe readiness state, and capabilities without returning credentials.",
    mutating: false,
    name: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Update the authenticated organization's default outbound provider or tenant-owned domain overrides. Existing queued messages keep their snapshotted provider.",
    mutating: true,
    name: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Test one outbound provider using operator secret-store credentials without accepting or returning secret material.",
    mutating: false,
    name: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[2],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Ingest one authenticated Amazon SES SNS or EventBridge delivery event into the tenant-bound message timeline and suppression service without accepting an organization ID.",
    mutating: true,
    name: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[3],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpOutboundProviderServices =
  OutboundProviderHttpServices;

const providerSchema = z.enum(LIVE_OUTBOUND_PROVIDERS);
const capabilitiesSchema = z.object({
  batch: z.boolean(),
  events: z.boolean(),
  scheduling: z.boolean(),
});
const settingsSchema = z.object({
  defaultProvider: providerSchema,
  domains: z.array(
    z.object({
      effectiveProvider: providerSchema,
      id: z.string().uuid(),
      name: z.string(),
      overrideProvider: providerSchema.nullable(),
      updatedAt: z.iso.datetime({ offset: true }),
    }),
  ),
  providers: z.array(
    z.object({
      capabilities: capabilitiesSchema,
      configured: z.boolean(),
      credentialScope: z.enum(["operator-default", "organization"]).nullable(),
      id: providerSchema,
      label: z.string(),
      state: z.enum([
        "adapter-unavailable",
        "configuration-invalid",
        "credentials-missing",
        "ready",
      ]),
    }),
  ),
  updatedAt: z.iso.datetime({ offset: true }),
});
const settingsOutputSchema = z.object({
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  settings: settingsSchema,
});
const testOutputSchema = z.object({
  details: z
    .object({
      accountMode: z.enum(["production", "sandbox"]),
      region: z.string(),
      sendingEnabled: z.boolean(),
    })
    .nullable(),
  ok: z.literal(true),
  protocolTimeZone: z.literal("UTC"),
  provider: providerSchema,
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  testedAt: z.iso.datetime({ offset: true }),
});
const eventOutputSchema = z.object({
  data: z.array(
    z.object({
      createdAt: z.iso.datetime({ offset: true }),
      eventId: z.string().uuid(),
      messageId: z.string().uuid(),
      provider: z.literal("aws-ses"),
      providerEventId: z.string(),
      replayed: z.boolean(),
      suppressionCount: z.number().int().min(0).max(50),
      type: z.enum(["bounced", "complained", "deferred", "delivered"]),
    }),
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

function errorResult(error: unknown) {
  let message = "The outbound-provider operation failed.";
  if (error instanceof AuthorizationError) {
    message =
      "The API key creator's current role does not allow this outbound-provider change.";
  } else if (error instanceof OutboundProviderSettingsError) {
    message =
      error.code === "MEMBERSHIP_REQUIRED"
        ? "Create a new API key from a current organization member."
        : error.code === "DOMAIN_NOT_FOUND"
          ? "Choose a sending domain from this organization."
          : error.issues[0]?.message ?? "Check the outbound-provider settings.";
  } else if (error instanceof OutboundProviderConfigurationError) {
    message = providerConfigurationErrorMessage(error);
  } else if (error instanceof OutboundProviderEventError) {
    message =
      error.code === "NO_MATCHING_MESSAGE"
        ? "The provider event does not match one message in this organization."
        : error.code === "MEMBERSHIP_REQUIRED"
          ? "Create a new API key from a current organization member."
          : "Provide one valid Amazon SES SNS or EventBridge event.";
  } else {
    console.error("PaperBoy MCP outbound-provider operation failed.");
  }
  return {
    content: [{ text: message, type: "text" as const }],
    isError: true,
  };
}

function serializedSettings(settings: OutboundProviderSettings) {
  return {
    defaultProvider: settings.defaultProvider,
    domains: settings.domains.map((domain) => ({
      effectiveProvider: domain.effectiveProvider,
      id: domain.id,
      name: domain.name,
      overrideProvider: domain.overrideProvider,
      updatedAt: protocolTimestamp(domain.updatedAt),
    })),
    providers: settings.providers,
    updatedAt: protocolTimestamp(settings.updatedAt),
  };
}

function settingsSuccess(settings: OutboundProviderSettings, now: Date) {
  const output = {
    observedAt: protocolTimestamp(now),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
    settings: serializedSettings(settings),
  };
  return {
    content: [{ text: JSON.stringify(output, null, 2), type: "text" as const }],
    structuredContent: output,
  };
}

export function registerPaperBoyOutboundProviderTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpOutboundProviderServices;
}) {
  const now = input.now ?? (() => new Date());

  input.server.registerTool(
    PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z.object({}).strict(),
      outputSchema: settingsOutputSchema,
      title: "Get PaperBoy outbound providers",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();
      try {
        return settingsSuccess(await input.services.get(principal), now());
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: z
        .object({
          defaultProvider: providerSchema.optional(),
          domainOverrides: z
            .array(
              z.object({
                domainId: z.string().uuid(),
                provider: providerSchema.nullable(),
              }),
            )
            .max(1000)
            .optional(),
        })
        .strict(),
      outputSchema: settingsOutputSchema,
      title: "Update PaperBoy outbound providers",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ defaultProvider, domainOverrides }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();
      try {
        return settingsSuccess(
          await input.services.update(principal, {
            ...(defaultProvider === undefined
              ? {}
              : { default_provider: defaultProvider }),
            ...(domainOverrides === undefined
              ? {}
              : {
                  domain_overrides: domainOverrides.map((domain) => ({
                    domain_id: domain.domainId,
                    provider: domain.provider,
                  })),
                }),
          }),
          now(),
        );
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[2],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_DEFINITIONS[2].description,
      inputSchema: z.object({ provider: providerSchema }).strict(),
      outputSchema: testOutputSchema,
      title: "Test PaperBoy outbound provider",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ provider }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();
      try {
        const result = await input.services.test(principal, { provider });
        const output = {
          details: result.details,
          ok: true as const,
          protocolTimeZone: "UTC" as const,
          provider: result.provider as LiveOutboundProvider,
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
          testedAt: protocolTimestamp(result.testedAt),
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
    PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_NAMES[3],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_OUTBOUND_PROVIDER_MCP_TOOL_DEFINITIONS[3].description,
      inputSchema: z
        .object({
          payload: z.record(z.string(), z.unknown()),
          provider: z.literal("aws-ses"),
        })
        .strict(),
      outputSchema: eventOutputSchema,
      title: "Ingest PaperBoy outbound-provider event",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ payload, provider }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();
      try {
        const results = await input.services.ingest(
          principal,
          provider,
          payload,
        );
        const output = {
          data: results.map((result) => ({
            createdAt: protocolTimestamp(result.createdAt),
            eventId: result.eventId,
            messageId: result.messageId,
            provider: "aws-ses" as const,
            providerEventId: result.providerEventId,
            replayed: result.replayed,
            suppressionCount: result.suppressionCount,
            type: result.type,
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
