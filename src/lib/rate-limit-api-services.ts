import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  RateLimitSettingsError,
} from "@/lib/rate-limit-core";
import type { RateLimitHttpServices } from "@/lib/rate-limit-http";
import {
  getRateLimitSettings,
  updateRateLimitSettings,
} from "@/lib/rate-limits";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new RateLimitSettingsError("MEMBERSHIP_REQUIRED");
  }
  return principal.actorUserId;
}

export const rateLimitApiServices: RateLimitHttpServices = {
  get: (principal) =>
    getRateLimitSettings({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
    }),
  update: (principal, payload) =>
    updateRateLimitSettings({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
      payload,
    }),
};
