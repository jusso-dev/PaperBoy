import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import type { MessageHttpServices } from "@/lib/message-http";
import {
  getMessageDetail,
  listMessageEvents,
} from "@/lib/message-events";
import { cancelEmail, rescheduleEmail } from "@/lib/message-lifecycle";
import {
  getMessageDeliveryOverview,
  type MessageDeliveryOverviewRecord,
} from "@/lib/message-statuses";

function context(principal: ApiKeyPrincipal, messageId: string) {
  return {
    actorUserId: principal.actorUserId,
    environment: principal.environment,
    messageId,
    orgId: principal.orgId,
  };
}

function boundedPage(value: unknown): number {
  const page = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

function boundedLimit(value: unknown): number {
  const limit = typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(limit)) return 20;
  return Math.max(1, Math.min(limit, 100));
}

export const messageApiServices: MessageHttpServices = {
  cancel: (principal, messageId) =>
    cancelEmail({ messageId, principal }),
  get: (principal, messageId) =>
    getMessageDetail(context(principal, messageId)),
  list: async (
    principal,
    query,
  ): Promise<{
    limit: number;
    messages: MessageDeliveryOverviewRecord[];
    page: number;
    total: number;
  }> => {
    const page = boundedPage(query.page);
    const limit = boundedLimit(query.limit);
    const overview = await getMessageDeliveryOverview({
      actorUserId: principal.actorUserId,
      environment: principal.environment,
      limit,
      offset: (page - 1) * limit,
      orgId: principal.orgId,
    });
    return {
      limit,
      messages: overview.messages,
      page,
      total: overview.total,
    };
  },
  listEvents: (principal, messageId) =>
    listMessageEvents(context(principal, messageId)),
  reschedule: (principal, messageId, payload) =>
    rescheduleEmail({ messageId, payload, principal }),
};
