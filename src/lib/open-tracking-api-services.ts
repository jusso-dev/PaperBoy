import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { OpenTrackingSettingsError } from "@/lib/open-tracking-core";
import type { OpenTrackingHttpServices } from "@/lib/open-tracking-http";
import {
  getOpenTrackingSettings,
  updateOpenTrackingSettings,
} from "@/lib/open-tracking";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new OpenTrackingSettingsError("MEMBERSHIP_REQUIRED");
  }
  return principal.actorUserId;
}

export const openTrackingApiServices: OpenTrackingHttpServices = {
  get: (principal) =>
    getOpenTrackingSettings({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
    }),
  update: (principal, payload) =>
    updateOpenTrackingSettings({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
    }),
};
