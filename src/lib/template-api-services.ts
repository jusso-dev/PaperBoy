import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { TemplateError } from "@/lib/template-core";
import type { TemplateHttpServices } from "@/lib/template-http";
import {
  createTemplate,
  deleteTemplate,
  getTemplate,
  listTemplates,
  previewStoredTemplate,
  updateTemplate,
} from "@/lib/templates";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new TemplateError("MEMBERSHIP_REQUIRED");
  }

  return principal.actorUserId;
}

export const templateApiServices: TemplateHttpServices = {
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
      payload,
      templateId,
    }),
};
