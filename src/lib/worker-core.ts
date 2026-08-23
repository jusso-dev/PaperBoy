import {
  DeliveryProviderError,
  type DeliveryAttachment,
} from "@/lib/email-delivery";
import type { MessageDeliveryMode } from "@/lib/email-core";
import {
  defineOutboundProviderAdapter,
  type OutboundDeliveryMessage,
  type OutboundProvider,
  type OutboundProviderAdapter,
  type OutboundSendResult,
} from "@/lib/outbound-provider-core";

export const DELIVERY_LEASE_MS = 5 * 60 * 1000;
export const MAX_DELIVERY_ATTEMPTS = 5;
export const RETRY_DELAYS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  30 * 60 * 1000,
  2 * 60 * 60 * 1000,
] as const;

export type WorkerClaim = Omit<OutboundDeliveryMessage, "attachments">;

export type WorkerDeliveryMessage = OutboundDeliveryMessage;

export type OutboundAdapter = {
  name: string;
  send: (
    message: WorkerDeliveryMessage,
  ) => Promise<OutboundSendResult | void>;
};

export type WorkerStore = {
  claim: (input: {
    deliveryModes: MessageDeliveryMode[];
    leaseExpiresAt: Date;
    now: Date;
    workerId: string;
  }) => Promise<Omit<WorkerClaim, "attachments"> | null>;
  loadAttachments: (messageId: string) => Promise<DeliveryAttachment[]>;
  markFailed: (input: {
    attemptCount: number;
    code: string;
    messageId: string;
    now: Date;
    reason: string;
    workerId: string;
  }) => Promise<boolean>;
  markRetry: (input: {
    attemptCount: number;
    code: string;
    messageId: string;
    nextAttemptAt: Date;
    now: Date;
    reason: string;
    workerId: string;
  }) => Promise<boolean>;
  markSent: (input: {
    attemptCount: number;
    messageId: string;
    now: Date;
    providerMessageId: string | null;
    workerId: string;
  }) => Promise<boolean>;
};

export type WorkerResult =
  | { state: "idle" }
  | {
      messageId: string;
      state: "failed" | "lease-lost" | "retry" | "sent";
    };

type DeliveryFailure = {
  code: string;
  reason: string;
  retryable: boolean;
};

function safeCode(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, "_")
    .slice(0, 128);
  return /^[a-z0-9]/.test(normalized) ? normalized : "delivery_error";
}

function safeReason(value: string): string {
  const normalized = value.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return (normalized || "Outbound adapter failed.").slice(0, 1000);
}

export class OutboundDeliveryError extends Error {
  readonly code: string;
  readonly reason: string;
  readonly retryable: boolean;

  constructor(input: { code: string; reason: string; retryable: boolean }) {
    super(input.code);
    this.name = "OutboundDeliveryError";
    this.code = safeCode(input.code);
    this.reason = safeReason(input.reason);
    this.retryable = input.retryable;
  }
}

export function httpDeliveryError(status: number): OutboundDeliveryError {
  const valid = Number.isInteger(status) && status >= 400 && status <= 599;
  const code = valid ? status : 500;
  return new OutboundDeliveryError({
    code: `http_${code}`,
    reason: `Outbound HTTP provider returned ${code}.`,
    retryable: code >= 500,
  });
}

export function smtpDeliveryError(status: number): OutboundDeliveryError {
  const valid = Number.isInteger(status) && status >= 400 && status <= 599;
  const code = valid ? status : 451;
  return new OutboundDeliveryError({
    code: `smtp_${code}`,
    reason: `SMTP server returned ${code}.`,
    retryable: code >= 400 && code < 500,
  });
}

function deliveryFailure(error: unknown): DeliveryFailure {
  if (error instanceof OutboundDeliveryError) {
    return {
      code: error.code,
      reason: error.reason,
      retryable: error.retryable,
    };
  }

  if (error instanceof DeliveryProviderError) {
    return {
      code: "message_too_large",
      reason: "Outbound provider rejected the message size.",
      retryable: false,
    };
  }

  return {
    code: "delivery_error",
    reason: "Outbound adapter failed.",
    retryable: true,
  };
}

export function nextRetryAt(attemptCount: number, now: Date): Date {
  const index = Math.max(0, Math.min(attemptCount - 1, RETRY_DELAYS_MS.length - 1));
  return new Date(now.getTime() + RETRY_DELAYS_MS[index]);
}

export const testSinkAdapter: OutboundProviderAdapter =
  defineOutboundProviderAdapter({
    capabilities: { batch: false, events: false, scheduling: false },
    provider: "test-sink",
    async mapEvent() {
      return [];
    },
    async send(message) {
      if (
        message.deliveryMode !== "test-sink" ||
        message.provider !== "test-sink"
      ) {
        throw new OutboundDeliveryError({
          code: "adapter_unavailable",
          reason: "No live outbound adapter is configured.",
          retryable: false,
        });
      }
      return { providerMessageId: null };
    },
    async testConnection() {},
  });

export function routeOutboundProviders(
  adapters: Readonly<Partial<Record<OutboundProvider, OutboundAdapter>>>,
): OutboundAdapter {
  return {
    name: "outbound-provider-router",
    async send(message) {
      const adapter = adapters[message.provider];

      if (!adapter) {
        throw new OutboundDeliveryError({
          code: "adapter_unavailable",
          reason: "No outbound adapter is configured for the selected provider.",
          retryable: false,
        });
      }

      return adapter.send(message);
    },
  };
}

export const routeOutboundAdapters = routeOutboundProviders;

export async function processNextMessage(input: {
  adapter: OutboundAdapter;
  deliveryModes: MessageDeliveryMode[];
  now?: () => Date;
  store: WorkerStore;
  workerId: string;
}): Promise<WorkerResult> {
  const now = input.now ?? (() => new Date());
  const claimedAt = now();
  const claim = await input.store.claim({
    deliveryModes: input.deliveryModes,
    leaseExpiresAt: new Date(claimedAt.getTime() + DELIVERY_LEASE_MS),
    now: claimedAt,
    workerId: input.workerId,
  });

  if (!claim) {
    return { state: "idle" };
  }

  try {
    const attachments = await input.store.loadAttachments(claim.id);
    const delivery = await input.adapter.send({ ...claim, attachments });
    const updated = await input.store.markSent({
      attemptCount: claim.attemptCount,
      messageId: claim.id,
      now: now(),
      providerMessageId: delivery?.providerMessageId ?? null,
      workerId: input.workerId,
    });
    return {
      messageId: claim.id,
      state: updated ? "sent" : "lease-lost",
    };
  } catch (error) {
    const failure = deliveryFailure(error);
    const failedAt = now();

    if (failure.retryable && claim.attemptCount < MAX_DELIVERY_ATTEMPTS) {
      const updated = await input.store.markRetry({
        attemptCount: claim.attemptCount,
        code: failure.code,
        messageId: claim.id,
        nextAttemptAt: nextRetryAt(claim.attemptCount, failedAt),
        now: failedAt,
        reason: failure.reason,
        workerId: input.workerId,
      });
      return {
        messageId: claim.id,
        state: updated ? "retry" : "lease-lost",
      };
    }

    const reason =
      failure.retryable && claim.attemptCount >= MAX_DELIVERY_ATTEMPTS
        ? safeReason(
            `Retry limit reached after ${claim.attemptCount} attempts. ${failure.reason}`,
          )
        : failure.reason;
    const updated = await input.store.markFailed({
      attemptCount: claim.attemptCount,
      code: failure.code,
      messageId: claim.id,
      now: failedAt,
      reason,
      workerId: input.workerId,
    });
    return {
      messageId: claim.id,
      state: updated ? "failed" : "lease-lost",
    };
  }
}
