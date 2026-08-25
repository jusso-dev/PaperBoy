import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { BroadcastError } from "@/lib/broadcast-core";
import type { BroadcastHttpServices } from "@/lib/broadcast-http";
import {
  cancelBroadcast,
  createBroadcast,
  getBroadcast,
  listBroadcasts,
  pauseBroadcast,
  resumeBroadcast,
  updateScheduledBroadcast,
} from "@/lib/broadcasts";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new BroadcastError("MEMBERSHIP_REQUIRED");
  }

  return principal.actorUserId;
}

function context(principal: ApiKeyPrincipal, broadcastId: string) {
  return {
    actorUserId: actorUserId(principal),
    broadcastId,
    orgId: principal.orgId,
  };
}

export const broadcastApiServices: BroadcastHttpServices = {
  cancel: (principal, broadcastId) =>
    cancelBroadcast(context(principal, broadcastId)),
  create: (principal, payload) => createBroadcast({ payload, principal }),
  get: (principal, broadcastId) =>
    getBroadcast(context(principal, broadcastId)),
  list: (principal) =>
    listBroadcasts({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
    }),
  pause: (principal, broadcastId) =>
    pauseBroadcast(context(principal, broadcastId)),
  resume: (principal, broadcastId) =>
    resumeBroadcast(context(principal, broadcastId)),
  update: (principal, broadcastId, payload) =>
    updateScheduledBroadcast({
      ...context(principal, broadcastId),
      payload,
    }),
};
