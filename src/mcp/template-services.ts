import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { TemplateError } from "@/lib/template-core";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  updateTemplate,
} from "@/lib/templates";
import type { PaperBoyMcpTemplateServices } from "@/mcp/template-tools";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new TemplateError("MEMBERSHIP_REQUIRED");
  }

  return principal.actorUserId;
}

export const paperBoyMcpTemplateServices: PaperBoyMcpTemplateServices = {
  create: (principal, payload) =>
    createTemplate({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
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
  update: (principal, templateId, payload) =>
    updateTemplate({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
      templateId,
    }),
};
