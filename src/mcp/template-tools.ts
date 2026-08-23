import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { AuthorizationError } from "@/lib/authorization";
import {
  MAX_TEMPLATE_BODY_LENGTH,
  MAX_TEMPLATE_NAME_LENGTH,
  MAX_TEMPLATE_SUBJECT_LENGTH,
  TemplateError,
  type TemplatePreview,
  type TemplateRecord,
} from "@/lib/template-core";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_TEMPLATE_MCP_TOOL_NAMES = [
  "paperboy_list_templates",
  "paperboy_get_template",
  "paperboy_create_template",
  "paperboy_update_template",
  "paperboy_delete_template",
  "paperboy_preview_template",
] as const;

export const PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "List named email templates for the authenticated organization.",
    mutating: false,
    name: PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Read one named email template from the authenticated organization.",
    mutating: false,
    name: PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Create a safe variable-substitution email template in the authenticated organization.",
    mutating: true,
    name: PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[2],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Update a named email template in the authenticated organization.",
    mutating: true,
    name: PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[3],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Permanently delete a named email template from the authenticated organization.",
    mutating: true,
    name: PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[4],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Render a template with sample JSON and report missing required variables without sending mail.",
    mutating: false,
    name: PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[5],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpTemplateServices = {
  create: (
    principal: ApiKeyPrincipal,
    payload: unknown,
  ) => Promise<TemplateRecord>;
  delete: (
    principal: ApiKeyPrincipal,
    templateId: string,
  ) => Promise<void>;
  get: (
    principal: ApiKeyPrincipal,
    templateId: string,
  ) => Promise<TemplateRecord>;
  list: (principal: ApiKeyPrincipal) => Promise<TemplateRecord[]>;
  preview: (
    principal: ApiKeyPrincipal,
    templateId: string,
    data: unknown,
  ) => Promise<TemplatePreview>;
  update: (
    principal: ApiKeyPrincipal,
    templateId: string,
    payload: unknown,
  ) => Promise<TemplateRecord>;
};

const templateFields = {
  html: z.string().max(MAX_TEMPLATE_BODY_LENGTH).nullable().optional(),
  name: z.string().min(1).max(MAX_TEMPLATE_NAME_LENGTH),
  requiredVariables: z.array(z.string().min(1).max(256)).max(100).optional(),
  subject: z.string().min(1).max(MAX_TEMPLATE_SUBJECT_LENGTH),
  text: z.string().max(MAX_TEMPLATE_BODY_LENGTH).nullable().optional(),
};

const createTemplateInputSchema = z
  .object(templateFields)
  .strict()
  .refine((value) => Boolean(value.html || value.text), {
    message: "Provide non-empty html or text template content.",
    path: ["body"],
  });

const updateTemplateInputSchema = z
  .object({
    html: templateFields.html,
    name: templateFields.name.optional(),
    requiredVariables: templateFields.requiredVariables,
    subject: templateFields.subject.optional(),
    templateId: z.string().uuid(),
    text: templateFields.text,
  })
  .strict()
  .refine(
    (value) =>
      value.html !== undefined ||
      value.name !== undefined ||
      value.requiredVariables !== undefined ||
      value.subject !== undefined ||
      value.text !== undefined,
    {
      message: "Provide at least one template field.",
      path: ["body"],
    },
  );

const templateIdInputSchema = z
  .object({ templateId: z.string().uuid() })
  .strict();

const deleteTemplateInputSchema = z
  .object({
    confirm: z.literal(true),
    templateId: z.string().uuid(),
  })
  .strict();

const previewTemplateInputSchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
    templateId: z.string().uuid(),
  })
  .strict();

const templateOutputSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  html: z.string().nullable(),
  id: z.string().uuid(),
  name: z.string(),
  requiredVariables: z.array(z.string()),
  subject: z.string(),
  text: z.string().nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});

const responseMetadata = {
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
};

const listTemplatesOutputSchema = z.object({
  observedAt: responseMetadata.observedAt,
  protocolTimeZone: responseMetadata.protocolTimeZone,
  schemaVersion: responseMetadata.schemaVersion,
  templates: z.array(templateOutputSchema),
});

const templateResponseOutputSchema = z.object({
  observedAt: responseMetadata.observedAt,
  protocolTimeZone: responseMetadata.protocolTimeZone,
  schemaVersion: responseMetadata.schemaVersion,
  template: templateOutputSchema,
});

const deleteTemplateOutputSchema = z.object({
  deleted: z.literal(true),
  observedAt: responseMetadata.observedAt,
  protocolTimeZone: responseMetadata.protocolTimeZone,
  schemaVersion: responseMetadata.schemaVersion,
  templateId: z.string().uuid(),
});

const previewTemplateOutputSchema = z.object({
  html: z.string().nullable(),
  missingVariables: z.array(z.string()),
  observedAt: responseMetadata.observedAt,
  protocolTimeZone: responseMetadata.protocolTimeZone,
  schemaVersion: responseMetadata.schemaVersion,
  subject: z.string(),
  templateId: z.string().uuid(),
  text: z.string().nullable(),
});

function serializeTemplate(template: TemplateRecord) {
  return {
    createdAt: protocolTimestamp(template.createdAt),
    html: template.html,
    id: template.id,
    name: template.name,
    requiredVariables: template.requiredVariables,
    subject: template.subject,
    text: template.text,
    updatedAt: protocolTimestamp(template.updatedAt),
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

function templateErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "The API key creator's current role does not allow this template operation.";
  }

  if (error instanceof TemplateError) {
    switch (error.code) {
      case "MEMBERSHIP_REQUIRED":
        return "Create a new API key from a current organization owner or admin.";
      case "TEMPLATE_EXISTS":
        return "A template with that name already exists in this organization.";
      case "TEMPLATE_NOT_FOUND":
        return "No template with that ID exists in this organization.";
      default:
        return error.issues[0]?.message ?? "Check the template fields.";
    }
  }

  console.error("PaperBoy MCP template operation failed.");
  return "The template operation failed.";
}

function errorResult(error: unknown) {
  return {
    content: [
      { text: templateErrorMessage(error), type: "text" as const },
    ],
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

export function registerPaperBoyTemplateTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpTemplateServices;
}) {
  const now = input.now ?? (() => new Date());
  const metadata = () => ({
    observedAt: protocolTimestamp(now()),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  });

  input.server.registerTool(
    PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z.object({}).strict(),
      outputSchema: listTemplatesOutputSchema,
      title: "List PaperBoy templates",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      try {
        const templates = await input.services.list(principal);
        return successResult({
          ...metadata(),
          templates: templates.map(serializeTemplate),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: templateIdInputSchema,
      outputSchema: templateResponseOutputSchema,
      title: "Get a PaperBoy template",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ templateId }) => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      try {
        const template = await input.services.get(principal, templateId);
        return successResult({
          ...metadata(),
          template: serializeTemplate(template),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[2],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS[2].description,
      inputSchema: createTemplateInputSchema,
      outputSchema: templateResponseOutputSchema,
      title: "Create a PaperBoy template",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async (payload) => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      try {
        const template = await input.services.create(principal, payload);
        return successResult({
          ...metadata(),
          template: serializeTemplate(template),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[3],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS[3].description,
      inputSchema: updateTemplateInputSchema,
      outputSchema: templateResponseOutputSchema,
      title: "Update a PaperBoy template",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ templateId, ...payload }) => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      try {
        const template = await input.services.update(
          principal,
          templateId,
          payload,
        );
        return successResult({
          ...metadata(),
          template: serializeTemplate(template),
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[4],
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS[4].description,
      inputSchema: deleteTemplateInputSchema,
      outputSchema: deleteTemplateOutputSchema,
      title: "Delete a PaperBoy template",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ templateId }) => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      try {
        await input.services.delete(principal, templateId);
        return successResult({
          deleted: true,
          ...metadata(),
          templateId,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_TEMPLATE_MCP_TOOL_NAMES[5],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_TEMPLATE_MCP_TOOL_DEFINITIONS[5].description,
      inputSchema: previewTemplateInputSchema,
      outputSchema: previewTemplateOutputSchema,
      title: "Preview a PaperBoy template",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ data, templateId }) => {
      const principal = await input.authorize();

      if (!principal) {
        return unauthorizedResult();
      }

      try {
        const preview = await input.services.preview(
          principal,
          templateId,
          data,
        );
        return successResult({
          html: preview.html,
          missingVariables: preview.missingVariables,
          ...metadata(),
          subject: preview.subject,
          templateId,
          text: preview.text,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
