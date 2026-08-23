import type { DeliveryMessage } from "@/lib/email-delivery";
import type { MessageDeliveryMode } from "@/lib/email-core";
import type { MessageEventType } from "@/lib/message-event-core";

export const LIVE_OUTBOUND_PROVIDERS = [
  "smtp",
  "cloudflare-email",
  "aws-ses",
  "azure-email",
] as const;

export const OUTBOUND_PROVIDERS = [
  ...LIVE_OUTBOUND_PROVIDERS,
  "test-sink",
] as const;

export type LiveOutboundProvider =
  (typeof LIVE_OUTBOUND_PROVIDERS)[number];
export type OutboundProvider = (typeof OUTBOUND_PROVIDERS)[number];

export type OutboundProviderCapabilities = {
  batch: boolean;
  events: boolean;
  scheduling: boolean;
};

export const OUTBOUND_PROVIDER_CATALOG: Readonly<
  Record<
    LiveOutboundProvider,
    { capabilities: OutboundProviderCapabilities; label: string }
  >
> = {
  "aws-ses": {
    capabilities: { batch: true, events: true, scheduling: false },
    label: "Amazon SES",
  },
  "azure-email": {
    capabilities: { batch: true, events: true, scheduling: false },
    label: "Azure Communication Services Email",
  },
  "cloudflare-email": {
    capabilities: { batch: false, events: true, scheduling: false },
    label: "Cloudflare Email Service",
  },
  smtp: {
    capabilities: { batch: false, events: true, scheduling: false },
    label: "SMTP",
  },
};

export type OutboundDeliveryMessage = DeliveryMessage & {
  attemptCount: number;
  deliveryMode: MessageDeliveryMode;
  environment: "live" | "test";
  id: string;
  orgId: string;
  provider: OutboundProvider;
};

export type OutboundSendResult = {
  providerMessageId: string | null;
};

export type OutboundProviderEvent = {
  data: Record<string, unknown>;
  messageId: string;
  occurredAt: Date;
  type: Extract<MessageEventType, "bounced" | "complained" | "delivered">;
};

export type OutboundProviderAdapter = {
  capabilities: OutboundProviderCapabilities;
  close?: () => void;
  mapEvent: (input: {
    payload: unknown;
    receivedAt: Date;
  }) => Promise<OutboundProviderEvent[]>;
  provider: OutboundProvider;
  schedule?: (input: {
    message: OutboundDeliveryMessage;
    scheduledFor: Date;
  }) => Promise<OutboundSendResult>;
  send: (message: OutboundDeliveryMessage) => Promise<OutboundSendResult>;
  sendBatch?: (
    messages: OutboundDeliveryMessage[],
  ) => Promise<OutboundSendResult[]>;
  testConnection: () => Promise<void>;
};

export class OutboundProviderContractError extends Error {
  constructor(readonly code: "INVALID_ADAPTER") {
    super(code);
    this.name = "OutboundProviderContractError";
  }
}

export function isLiveOutboundProvider(
  value: unknown,
): value is LiveOutboundProvider {
  return (
    typeof value === "string" &&
    LIVE_OUTBOUND_PROVIDERS.includes(value as LiveOutboundProvider)
  );
}

export function isOutboundProvider(value: unknown): value is OutboundProvider {
  return (
    typeof value === "string" &&
    OUTBOUND_PROVIDERS.includes(value as OutboundProvider)
  );
}

export function providerLabel(provider: LiveOutboundProvider): string {
  return OUTBOUND_PROVIDER_CATALOG[provider].label;
}

export function defineOutboundProviderAdapter<T extends OutboundProviderAdapter>(
  adapter: T,
): T {
  const batchMatches = adapter.capabilities.batch === Boolean(adapter.sendBatch);
  const schedulingMatches =
    adapter.capabilities.scheduling === Boolean(adapter.schedule);

  if (
    !isOutboundProvider(adapter.provider) ||
    typeof adapter.send !== "function" ||
    typeof adapter.mapEvent !== "function" ||
    typeof adapter.testConnection !== "function" ||
    !batchMatches ||
    !schedulingMatches
  ) {
    throw new OutboundProviderContractError("INVALID_ADAPTER");
  }

  return adapter;
}
