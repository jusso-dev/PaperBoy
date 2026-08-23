import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import type { MessageHttpServices } from "@/lib/message-http";
import {
  getMessageDetail,
  listMessageEvents,
} from "@/lib/message-events";

function context(principal: ApiKeyPrincipal, messageId: string) {
  return {
    actorUserId: principal.actorUserId,
    environment: principal.environment,
    messageId,
    orgId: principal.orgId,
  };
}

export const messageApiServices: MessageHttpServices = {
  get: (principal, messageId) =>
    getMessageDetail(context(principal, messageId)),
  listEvents: (principal, messageId) =>
    listMessageEvents(context(principal, messageId)),
};
