import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  AudienceError,
  MAX_AUDIENCE_NAME_LENGTH,
  MAX_CONTACT_NAME_LENGTH,
  type AudienceRecord,
  type ContactRecord,
} from "@/lib/audience-core";
import type { ContactImportResult } from "@/lib/audiences";
import { AuthorizationError } from "@/lib/authorization";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_AUDIENCE_MCP_TOOL_NAMES = [
  "paperboy_list_audiences",
  "paperboy_get_audience",
  "paperboy_create_audience",
  "paperboy_update_audience",
  "paperboy_delete_audience",
  "paperboy_list_contacts",
  "paperboy_get_contact",
  "paperboy_create_contact",
  "paperboy_update_contact",
  "paperboy_delete_contact",
  "paperboy_import_contacts",
] as const;

export const PAPERBOY_AUDIENCE_MCP_TOOL_DEFINITIONS = [
  ["List organization audiences with active and total contact counts.", false],
  ["Read one organization audience without exposing another tenant.", false],
  ["Create a permission-based contact audience in the authenticated organization.", true],
  ["Rename one audience in the authenticated organization.", true],
  ["Delete one audience and all of its contacts after explicit confirmation.", true],
  ["List the contacts and unsubscribe state in one organization audience.", false],
  ["Read one contact in one organization audience.", false],
  ["Add one permission-based contact to an organization audience.", true],
  ["Update one contact's email or name without clearing unsubscribe state.", true],
  ["Delete one contact after explicit confirmation.", true],
  ["Atomically import a bounded UTF-8 contact CSV into one audience.", true],
].map(([description, mutating], index) => ({
  description: description as string,
  mutating: mutating as boolean,
  name: PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[index],
  schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
}));

export type PaperBoyMcpAudienceServices = {
  createAudience: (principal: ApiKeyPrincipal, payload: unknown) => Promise<AudienceRecord>;
  createContact: (principal: ApiKeyPrincipal, audienceId: string, payload: unknown) => Promise<ContactRecord>;
  deleteAudience: (principal: ApiKeyPrincipal, audienceId: string) => Promise<void>;
  deleteContact: (principal: ApiKeyPrincipal, audienceId: string, contactId: string) => Promise<void>;
  getAudience: (principal: ApiKeyPrincipal, audienceId: string) => Promise<AudienceRecord>;
  getContact: (principal: ApiKeyPrincipal, audienceId: string, contactId: string) => Promise<ContactRecord>;
  importContacts: (principal: ApiKeyPrincipal, audienceId: string, csv: string) => Promise<ContactImportResult>;
  listAudiences: (principal: ApiKeyPrincipal) => Promise<AudienceRecord[]>;
  listContacts: (principal: ApiKeyPrincipal, audienceId: string) => Promise<ContactRecord[]>;
  updateAudience: (principal: ApiKeyPrincipal, audienceId: string, payload: unknown) => Promise<AudienceRecord>;
  updateContact: (principal: ApiKeyPrincipal, audienceId: string, contactId: string, payload: unknown) => Promise<ContactRecord>;
};

const audienceIdSchema = z.object({ audienceId: z.string().uuid() }).strict();
const contactIdSchema = z.object({ audienceId: z.string().uuid(), contactId: z.string().uuid() }).strict();
const createAudienceSchema = z.object({ name: z.string().min(1).max(MAX_AUDIENCE_NAME_LENGTH) }).strict();
const updateAudienceSchema = z.object({ audienceId: z.string().uuid(), name: z.string().min(1).max(MAX_AUDIENCE_NAME_LENGTH) }).strict();
const deleteAudienceSchema = z.object({ audienceId: z.string().uuid(), confirm: z.literal(true) }).strict();
const createContactSchema = z.object({
  audienceId: z.string().uuid(),
  email: z.string().min(3).max(254),
  name: z.string().max(MAX_CONTACT_NAME_LENGTH).nullable().optional(),
}).strict();
const updateContactSchema = z.object({
  audienceId: z.string().uuid(),
  contactId: z.string().uuid(),
  email: z.string().min(3).max(254).optional(),
  name: z.string().max(MAX_CONTACT_NAME_LENGTH).nullable().optional(),
}).strict().refine((value) => value.email !== undefined || value.name !== undefined, {
  message: "Provide email or name to update.",
});
const deleteContactSchema = z.object({
  audienceId: z.string().uuid(),
  contactId: z.string().uuid(),
  confirm: z.literal(true),
}).strict();
const importContactsSchema = z.object({
  audienceId: z.string().uuid(),
  csv: z.string().min(1).max(1024 * 1024),
}).strict();

const metadataSchema = {
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
};
const audienceSchema = z.object({
  activeContactCount: z.number().int().nonnegative(),
  contactCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  id: z.string().uuid(),
  name: z.string(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const contactSchema = z.object({
  audienceId: z.string().uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  email: z.string(),
  id: z.string().uuid(),
  name: z.string().nullable(),
  unsubscribedAt: z.iso.datetime({ offset: true }).nullable(),
  updatedAt: z.iso.datetime({ offset: true }),
});
const audienceOutputSchema = z.object({ audience: audienceSchema, ...metadataSchema });
const audiencesOutputSchema = z.object({ audiences: z.array(audienceSchema), ...metadataSchema });
const contactOutputSchema = z.object({ contact: contactSchema, ...metadataSchema });
const contactsOutputSchema = z.object({ contacts: z.array(contactSchema), ...metadataSchema });
const deleteOutputSchema = z.object({ deletedId: z.string().uuid(), ...metadataSchema });
const importOutputSchema = z.object({
  created: z.number().int().nonnegative(),
  importedAt: z.iso.datetime({ offset: true }),
  inputRows: z.number().int().nonnegative(),
  unchanged: z.number().int().nonnegative(),
  uniqueRows: z.number().int().nonnegative(),
  updated: z.number().int().nonnegative(),
  ...metadataSchema,
});

function serializeAudience(record: AudienceRecord) {
  return {
    activeContactCount: record.activeContactCount,
    contactCount: record.contactCount,
    createdAt: protocolTimestamp(record.createdAt),
    id: record.id,
    name: record.name,
    updatedAt: protocolTimestamp(record.updatedAt),
  };
}

function serializeContact(record: ContactRecord) {
  return {
    audienceId: record.audienceId,
    createdAt: protocolTimestamp(record.createdAt),
    email: record.email,
    id: record.id,
    name: record.name,
    unsubscribedAt: record.unsubscribedAt ? protocolTimestamp(record.unsubscribedAt) : null,
    updatedAt: protocolTimestamp(record.updatedAt),
  };
}

function unauthorizedResult() {
  return {
    content: [{ text: "Authorization failed. Reconnect with a valid PaperBoy API key.", type: "text" as const }],
    isError: true,
  };
}

function errorResult(error: unknown) {
  let message = "The audience operation failed.";
  if (error instanceof AuthorizationError) {
    message = "The API key creator's current role does not allow this audience operation.";
  } else if (error instanceof AudienceError) {
    const messages: Partial<Record<typeof error.code, string>> = {
      AUDIENCE_EMPTY: "The audience has no active subscribed contacts.",
      AUDIENCE_EXISTS: "An audience with that name already exists.",
      AUDIENCE_FULL: "An audience can contain at most 100 contacts.",
      AUDIENCE_NOT_FOUND: "No audience with that ID exists in this organization.",
      CONTACT_EXISTS: "That email address already belongs to this audience.",
      CONTACT_NOT_FOUND: "No contact with that ID exists in this audience.",
      CSV_TOO_LARGE: "Contact CSV files must not exceed 1 MiB.",
      CSV_TOO_MANY_ROWS: "Contact CSV files must not exceed 100 data rows.",
      MEMBERSHIP_REQUIRED: "Create a new API key from a current organization member.",
      VALIDATION_ERROR: error.issues[0]?.message ?? "Check the audience fields.",
    };
    message = messages[error.code] ?? message;
  } else console.error("PaperBoy MCP audience operation failed.");
  return { content: [{ text: message, type: "text" as const }], isError: true };
}

function successResult(output: Record<string, unknown>) {
  return {
    content: [{ text: JSON.stringify(output, null, 2), type: "text" as const }],
    structuredContent: output,
  };
}

const readAnnotations = { destructiveHint: false, idempotentHint: true, openWorldHint: false, readOnlyHint: true } as const;
const writeAnnotations = { destructiveHint: false, idempotentHint: false, openWorldHint: false, readOnlyHint: false } as const;
const deleteAnnotations = { destructiveHint: true, idempotentHint: true, openWorldHint: false, readOnlyHint: false } as const;

export function registerPaperBoyAudienceTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now?: () => Date;
  server: McpServer;
  services: PaperBoyMcpAudienceServices;
}) {
  const now = input.now ?? (() => new Date());
  const metadata = () => ({
    observedAt: protocolTimestamp(now()),
    protocolTimeZone: "UTC" as const,
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  });
  const config = (index: number, title: string, outputSchema: z.ZodType, annotations: typeof readAnnotations | typeof writeAnnotations | typeof deleteAnnotations) => ({
    annotations,
    description: PAPERBOY_AUDIENCE_MCP_TOOL_DEFINITIONS[index].description,
    outputSchema,
    title,
    _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[0], { ...config(0, "List PaperBoy audiences", audiencesOutputSchema, readAnnotations), inputSchema: z.object({}).strict() }, async () => {
    const principal = await input.authorize();
    if (!principal) return unauthorizedResult();
    try {
      const records = await input.services.listAudiences(principal);
      return successResult({ audiences: records.map(serializeAudience), ...metadata() });
    } catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[1], { ...config(1, "Get a PaperBoy audience", audienceOutputSchema, readAnnotations), inputSchema: audienceIdSchema }, async ({ audienceId }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { return successResult({ audience: serializeAudience(await input.services.getAudience(principal, audienceId)), ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[2], { ...config(2, "Create a PaperBoy audience", audienceOutputSchema, writeAnnotations), inputSchema: createAudienceSchema }, async (payload) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { return successResult({ audience: serializeAudience(await input.services.createAudience(principal, payload)), ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[3], { ...config(3, "Update a PaperBoy audience", audienceOutputSchema, writeAnnotations), inputSchema: updateAudienceSchema }, async ({ audienceId, ...payload }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { return successResult({ audience: serializeAudience(await input.services.updateAudience(principal, audienceId, payload)), ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[4], { ...config(4, "Delete a PaperBoy audience", deleteOutputSchema, deleteAnnotations), inputSchema: deleteAudienceSchema }, async ({ audienceId }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { await input.services.deleteAudience(principal, audienceId); return successResult({ deletedId: audienceId, ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[5], { ...config(5, "List PaperBoy contacts", contactsOutputSchema, readAnnotations), inputSchema: audienceIdSchema }, async ({ audienceId }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { const records = await input.services.listContacts(principal, audienceId); return successResult({ contacts: records.map(serializeContact), ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[6], { ...config(6, "Get a PaperBoy contact", contactOutputSchema, readAnnotations), inputSchema: contactIdSchema }, async ({ audienceId, contactId }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { return successResult({ contact: serializeContact(await input.services.getContact(principal, audienceId, contactId)), ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[7], { ...config(7, "Create a PaperBoy contact", contactOutputSchema, writeAnnotations), inputSchema: createContactSchema }, async ({ audienceId, ...payload }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { return successResult({ contact: serializeContact(await input.services.createContact(principal, audienceId, payload)), ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[8], { ...config(8, "Update a PaperBoy contact", contactOutputSchema, writeAnnotations), inputSchema: updateContactSchema }, async ({ audienceId, contactId, ...payload }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { return successResult({ contact: serializeContact(await input.services.updateContact(principal, audienceId, contactId, payload)), ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[9], { ...config(9, "Delete a PaperBoy contact", deleteOutputSchema, deleteAnnotations), inputSchema: deleteContactSchema }, async ({ audienceId, contactId }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try { await input.services.deleteContact(principal, audienceId, contactId); return successResult({ deletedId: contactId, ...metadata() }); }
    catch (error) { return errorResult(error); }
  });

  input.server.registerTool(PAPERBOY_AUDIENCE_MCP_TOOL_NAMES[10], { ...config(10, "Import PaperBoy contacts", importOutputSchema, writeAnnotations), inputSchema: importContactsSchema }, async ({ audienceId, csv }) => {
    const principal = await input.authorize(); if (!principal) return unauthorizedResult();
    try {
      const result = await input.services.importContacts(principal, audienceId, csv);
      return successResult({
        created: result.created,
        importedAt: protocolTimestamp(result.importedAt),
        inputRows: result.inputRows,
        unchanged: result.unchanged,
        uniqueRows: result.uniqueRows,
        updated: result.updated,
        ...metadata(),
      });
    } catch (error) { return errorResult(error); }
  });
}
