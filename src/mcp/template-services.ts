import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { TemplateError } from "@/lib/template-core";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  previewStoredTemplate,
  updateTemplate,
} from "@/lib/templates";
import type { PaperBoyMcpTemplateServices } from "@/mcp/template-tools";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new TemplateError("MEMBERSHIP_REQUIRED");
  }

  return principal.actorUserId;
}

function servicePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const input = payload as Record<string, unknown>;

  if (!Object.hasOwn(input, "requiredVariables")) {
    return input;
  }

  const mapped: Record<string, unknown> = {
    ...input,
    required_variables: input.requiredVariables,
  };
  delete mapped.requiredVariables;
  return mapped;
}

export const paperBoyMcpTemplateServices: PaperBoyMcpTemplateServices = {
  create: (principal, payload) =>
    createTemplate({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload: servicePayload(payload),
    }),
  delete: (principal, templateId) =>
    deleteTemplate({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      templateId,
    }),
  get: (principal, templateId) =>
    getTemplate({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      templateId,
    }),
  list: (principal) =>
    listTemplates({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
    }),
  preview: (principal, templateId, data) =>
    previewStoredTemplate({
      actorUserId: actorUserId(principal),
      data,
      orgId: principal.orgId,
      templateId,
    }),
  update: (principal, templateId, payload) =>
    updateTemplate({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload: servicePayload(payload),
      templateId,
    }),
};
