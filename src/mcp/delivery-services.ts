import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { listMessageEvents } from "@/lib/message-events";
import {
  getMessageDeliveryStatus,
  listMessageDeliveryStatuses,
} from "@/lib/message-statuses";
import type { PaperBoyMcpDeliveryServices } from "@/mcp/delivery-tools";

function actorUserId(principal: ApiKeyPrincipal): string | null {
  return principal.actorUserId;
}

export const paperBoyMcpDeliveryServices: PaperBoyMcpDeliveryServices = {
  get: (principal, messageId) =>
    getMessageDeliveryStatus({
      actorUserId: actorUserId(principal),
      environment: principal.environment,
      messageId,
      orgId: principal.orgId,
    }),
  list: (principal, limit) =>
    listMessageDeliveryStatuses({
      actorUserId: actorUserId(principal),
      environment: principal.environment,
      limit,
      orgId: principal.orgId,
    }),
  listEvents: (principal, messageId) =>
    listMessageEvents({
      actorUserId: actorUserId(principal),
      environment: principal.environment,
      messageId,
      orgId: principal.orgId,
    }),
};
