import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  createSuppression,
  deleteSuppression,
  getSuppression,
  importSuppressions,
  listSuppressions,
  updateSuppression,
} from "@/lib/suppressions";
import { SuppressionError } from "@/lib/suppression-core";
import type { SuppressionHttpServices } from "@/lib/suppression-http";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new SuppressionError("MEMBERSHIP_REQUIRED");
  }

  return principal.actorUserId;
}

export const suppressionApiServices: SuppressionHttpServices = {
  create: (principal, payload) =>
    createSuppression({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
    }),
  delete: (principal, suppressionId) =>
    deleteSuppression({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      suppressionId,
    }),
  get: (principal, suppressionId) =>
    getSuppression({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      suppressionId,
    }),
  import: (principal, csv) =>
    importSuppressions({
      actorUserId: actorUserId(principal),
      csv,
      orgId: principal.orgId,
    }),
  list: (principal, filter) =>
    listSuppressions({
      actorUserId: actorUserId(principal),
      filter,
      orgId: principal.orgId,
    }),
  update: (principal, suppressionId, payload) =>
    updateSuppression({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
      suppressionId,
    }),
};
