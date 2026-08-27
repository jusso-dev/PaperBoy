import type {
  MessageDeliveryMode,
  MessageStatus,
} from "@/lib/email-core";
import type { OutboundProvider } from "@/lib/outbound-provider-core";

export type MessageDeliveryStatusRecord = {
  attemptCount: number;
  createdAt: Date;
  deliveryMode: MessageDeliveryMode;
  domainId: string | null;
  environment: "live" | "test";
  failedAt: Date | null;
  failureReason: string | null;
  id: string;
  lastAttemptAt: Date | null;
  lastErrorCode: string | null;
  leaseExpiresAt: Date | null;
  nextAttemptAt: Date | null;
  provider: OutboundProvider;
  sentAt: Date | null;
  status: MessageStatus;
  updatedAt: Date;
};

export type MessageDeliveryOverviewRecord = MessageDeliveryStatusRecord & {
  subject: string;
  to: string[];
};

export const MESSAGE_LOG_SORTS = [
  "created",
  "status",
  "subject",
  "attempts",
] as const;
export type MessageLogSort = (typeof MESSAGE_LOG_SORTS)[number];
export type MessageLogOrder = "asc" | "desc";
export const MESSAGE_LOG_PAGE_SIZE = 100;
export const MESSAGE_LOG_QUERY_MAX = 200;

export type MessageDeliveryStatusFilters = {
  createdAtBefore?: Date;
  createdAtFrom?: Date;
  domainId?: string;
  query?: string;
  status?: MessageStatus;
};

export type MessageDeliveryCounts = Record<MessageStatus, number>;

export function parseMessageLogQuery(
  value: string | undefined,
): string | undefined {
  const query = value?.trim() ?? "";
  if (!query) return undefined;
  return query.slice(0, MESSAGE_LOG_QUERY_MAX);
}

export function parseMessageLogSort(
  value: string | undefined,
): MessageLogSort {
  return MESSAGE_LOG_SORTS.includes(value as MessageLogSort)
    ? (value as MessageLogSort)
    : "created";
}

export function parseMessageLogOrder(
  value: string | undefined,
): MessageLogOrder {
  return value === "asc" ? "asc" : "desc";
}

export function parseMessageLogPage(value: string | undefined): number {
  const page = Number(value);
  return Number.isInteger(page) && page >= 1 ? page : 1;
}

export class MessageStatusError extends Error {
  constructor(readonly code: "MEMBERSHIP_REQUIRED" | "MESSAGE_NOT_FOUND") {
    super(code);
    this.name = "MessageStatusError";
  }
}
