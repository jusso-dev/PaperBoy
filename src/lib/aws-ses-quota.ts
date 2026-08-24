import { createHash } from "node:crypto";
import type { ProviderAwsSesConfiguration } from "@/lib/outbound-provider-configuration";
import type { OutboundDeliveryMessage } from "@/lib/outbound-provider-core";

export const AWS_SES_QUOTA_REFRESH_MS = 60_000;
export const AWS_SES_RATE_UTILIZATION = 0.8;
export const AWS_SES_DAILY_UTILIZATION = 0.9;

export type AwsSesQuotaSnapshot = {
  max24HourSend: number;
  maxSendRate: number;
  observedAt: Date;
  sentLast24Hours: number;
};

export type AwsSesQuotaReservation = {
  delayMs: number;
  scheduledAt: Date;
};

export type AwsSesQuotaGuard = {
  reserve: (input: {
    now: Date;
    recipientCount: number;
    reservationKey: string;
    scopeHash: string;
    snapshot: AwsSesQuotaSnapshot;
  }) => Promise<AwsSesQuotaReservation | { retryAt: Date }>;
};

function finiteQuota(value: unknown, allowUnlimited = false): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (allowUnlimited && value === -1) return value;
  return value >= 0 ? value : null;
}

export function parseAwsSesQuotaSnapshot(
  value: unknown,
  observedAt: Date,
): AwsSesQuotaSnapshot | null {
  if (!value || typeof value !== "object" || !Number.isFinite(observedAt.getTime())) {
    return null;
  }
  const quota = value as Record<string, unknown>;
  const max24HourSend = finiteQuota(quota.Max24HourSend, true);
  const maxSendRate = finiteQuota(quota.MaxSendRate);
  const sentLast24Hours = finiteQuota(quota.SentLast24Hours);
  if (
    max24HourSend === null ||
    maxSendRate === null ||
    maxSendRate <= 0 ||
    sentLast24Hours === null
  ) {
    return null;
  }
  return { max24HourSend, maxSendRate, observedAt, sentLast24Hours };
}

export function safeAwsSesRecipientsPerSecond(
  snapshot: AwsSesQuotaSnapshot,
): number {
  const safeRate = snapshot.maxSendRate * AWS_SES_RATE_UTILIZATION;
  return safeRate >= 1 ? Math.floor(safeRate) : safeRate;
}

export function safeAwsSesDailyRecipients(
  snapshot: AwsSesQuotaSnapshot,
): number | null {
  return snapshot.max24HourSend === -1
    ? null
    : Math.max(
        0,
        Math.floor(snapshot.max24HourSend * AWS_SES_DAILY_UTILIZATION),
      );
}

export function awsSesQuotaScopeHash(
  configuration: ProviderAwsSesConfiguration,
): string {
  const identity =
    configuration.credentials.kind === "access-key"
      ? `access-key:${configuration.credentials.credentials.accessKeyId}`
      : configuration.credentials.kind === "assume-role"
        ? `assume-role:${configuration.credentials.roleArn}`
        : "default-chain";
  return createHash("sha256")
    .update(`${configuration.region}\0${identity}`)
    .digest("hex");
}

export function awsSesReservationKey(
  messages: readonly OutboundDeliveryMessage[],
): string {
  const hash = createHash("sha256");
  for (const message of messages) {
    hash.update(message.id);
    hash.update(":");
    hash.update(String(message.attemptCount));
    hash.update("\0");
  }
  return hash.digest("hex");
}
