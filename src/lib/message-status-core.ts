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

export type MessageDeliveryStatusFilters = {
  createdAtBefore?: Date;
  createdAtFrom?: Date;
  domainId?: string;
  status?: MessageStatus;
};

export type MessageDeliveryCounts = Record<MessageStatus, number>;

export class MessageStatusError extends Error {
  constructor(readonly code: "MEMBERSHIP_REQUIRED" | "MESSAGE_NOT_FOUND") {
    super(code);
    this.name = "MessageStatusError";
  }
}
