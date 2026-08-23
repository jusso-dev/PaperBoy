import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  MAX_SUPPRESSION_CSV_BYTES,
  MAX_SUPPRESSION_LIST_LIMIT,
  SuppressionError,
  type SuppressionRecord,
} from "@/lib/suppression-core";
import type { SuppressionImportResult } from "@/lib/suppressions";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES = [
  "paperboy_list_suppressions",
  "paperboy_get_suppression",
  "paperboy_create_suppression",
  "paperboy_update_suppression",
  "paperboy_delete_suppression",
  "paperboy_import_suppressions",
] as const;

export const PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "List bounced, complained, and manual suppressions for the authenticated organization.",
    mutating: false,
    name: PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Read one suppression from the authenticated organization.",
    mutating: false,
    name: PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Suppress one email address before SMTP or Cloudflare delivery.",
    mutating: true,
    name: PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[2],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Update one suppression in the authenticated organization.",
    mutating: true,
    name: PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[3],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Remove one suppression so the address may receive future mail.",
    mutating: true,
    name: PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[4],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Idempotently import a bounded UTF-8 suppression CSV into the authenticated organization.",
    mutating: true,
    name: PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[5],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpSuppressionServices = {
  create: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<SuppressionRecord>;
  delete: (
    principal: ApiKeyPrincipal,
    suppressionId: string,
  ) => Promise<void>;
  get: (
    principal: ApiKeyPrincipal,
    suppressionId: string,
  ) => Promise<SuppressionRecord>;
  import: (
    principal: ApiKeyPrincipal,
    csv: string,
  ) => Promise<SuppressionImportResult>;
  list: (
    principal: ApiKeyPrincipal,
    filter: { limit?: unknown; query?: unknown; reason?: unknown },
  ) => Promise<SuppressionRecord[]>;
  update: (
    principal: ApiKeyPrincipal,
    suppressionId: string,
    payload: unknown,
  ) => Promise<SuppressionRecord>;
};

const suppressionReasonSchema = z.enum(["manual", "bounced", "complained"]);
const suppressionIdSchema = z.string().uuid();
const suppressionOutputSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  email: z.email(),
  id: suppressionIdSchema,
  reason: suppressionReasonSchema,
  updatedAt: z.iso.datetime({ offset: true }),
});
const metadataSchema = {
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
};
const listOutputSchema = z.object({
  ...metadataSchema,
  suppressions: z.array(suppressionOutputSchema),
});
const itemOutputSchema = z.object({
  ...metadataSchema,
  suppression: suppressionOutputSchema,
});
const deleteOutputSchema = z.object({
  deleted: z.literal(true),
  ...metadataSchema,
  suppressionId: suppressionIdSchema,
});
const importOutputSchema = z.object({
  created: z.number().int().nonnegative(),
  importedAt: z.iso.datetime({ offset: true }),
  inputRows: z.number().int().nonnegative(),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
  unchanged: z.number().int().nonnegative(),
  uniqueRows: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
});

function serialize(suppression: SuppressionRecord) {
  return {
    createdAt: protocolTimestamp(suppression.createdAt),
    email: suppression.email,
    id: suppression.id,
    reason: suppression.reason,
    updatedAt: protocolTimestamp(suppression.updatedAt),
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

function errorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "The API key creator's current role does not allow this suppression operation.";
  }

  if (error instanceof SuppressionError) {
    switch (error.code) {
      case "MEMBERSHIP_REQUIRED":
        return "Create a new API key from a current organization member.";
      case "SUPPRESSION_NOT_FOUND":
        return "No suppression with that ID exists in this organization.";
      case "SUPPRESSION_EXISTS":
        return "That email address is already suppressed in this organization.";
      case "CSV_TOO_LARGE":
        return "Suppression CSV files must not exceed 1 MiB.";
      case "CSV_TOO_MANY_ROWS":
        return "Suppression CSV files must not exceed 5,000 data rows.";
      default:
        return error.issues[0]?.message ?? "Check the suppression input.";
    }
  }

  console.error("PaperBoy MCP suppression operation failed.");
  return "The suppression operation failed.";
}

function errorResult(error: unknown) {
  return {
    content: [{ text: errorMessage(error), type: "text" as const }],
    isError: true,
  };
}

function successResult(output: Record<string, unknown>) {
  return {
    content: [
      { text: JSON.stringify(output, null, 2), type: "text" as const },
    ],
    structuredContent: output,
  };
}

export function registerPaperBoySuppressionTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpSuppressionServices;
}) {
  const now = input.now ?? (() => new Date());
  const metadata = () => ({
    observedAt: protocolTimestamp(now()),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  });

  input.server.registerTool(
    PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z
        .object({
          limit: z.number().int().min(1).max(MAX_SUPPRESSION_LIST_LIMIT).optional(),
          query: z.string().min(1).max(254).optional(),
          reason: suppressionReasonSchema.optional(),
        })
        .strict(),
      outputSchema: listOutputSchema,
      title: "List PaperBoy suppressions",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async (filter) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const suppressions = await input.services.list(principal, filter);
        return successResult({
          ...metadata(),
          suppressions: suppressions.map(serialize),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: z.object({ suppressionId: suppressionIdSchema }).strict(),
      outputSchema: itemOutputSchema,
      title: "Get a PaperBoy suppression",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ suppressionId }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        return successResult({
          ...metadata(),
          suppression: serialize(
            await input.services.get(principal, suppressionId),
          ),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[2],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS[2].description,
      inputSchema: z
        .object({ email: z.email(), reason: suppressionReasonSchema.optional() })
        .strict(),
      outputSchema: itemOutputSchema,
      title: "Create a PaperBoy suppression",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async (payload) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        return successResult({
          ...metadata(),
          suppression: serialize(await input.services.create(principal, payload)),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[3],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS[3].description,
      inputSchema: z
        .object({
          email: z.email().optional(),
          reason: suppressionReasonSchema.optional(),
          suppressionId: suppressionIdSchema,
        })
        .strict()
        .refine(
          (value) => value.email !== undefined || value.reason !== undefined,
          { message: "Provide email or reason to update.", path: ["body"] },
        ),
      outputSchema: itemOutputSchema,
      title: "Update a PaperBoy suppression",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ suppressionId, ...payload }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        return successResult({
          ...metadata(),
          suppression: serialize(
            await input.services.update(principal, suppressionId, payload),
          ),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[4],
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS[4].description,
      inputSchema: z
        .object({ confirm: z.literal(true), suppressionId: suppressionIdSchema })
        .strict(),
      outputSchema: deleteOutputSchema,
      title: "Delete a PaperBoy suppression",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ suppressionId }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        await input.services.delete(principal, suppressionId);
        return successResult({
          deleted: true,
          ...metadata(),
          suppressionId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_SUPPRESSION_MCP_TOOL_NAMES[5],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_SUPPRESSION_MCP_TOOL_DEFINITIONS[5].description,
      inputSchema: z
        .object({ csv: z.string().min(1).max(MAX_SUPPRESSION_CSV_BYTES) })
        .strict(),
      outputSchema: importOutputSchema,
      title: "Import PaperBoy suppressions",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ csv }) => {
      const principal = await input.authorize();
      if (!principal) return unauthorizedResult();

      try {
        const result = await input.services.import(principal, csv);
        return successResult({
          created: result.created,
          importedAt: protocolTimestamp(result.importedAt),
          inputRows: result.inputRows,
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
          unchanged: result.unchanged,
          uniqueRows: result.uniqueRows,
          updated: result.updated,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
