import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, orgMembers } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
} from "@/lib/authorization";
import {
  MessageStatusError,
  type MessageDeliveryCounts,
  type MessageDeliveryStatusRecord,
} from "@/lib/message-status-core";

export type {
  MessageDeliveryCounts,
  MessageDeliveryStatusRecord,
} from "@/lib/message-status-core";

const MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const statusSelection = {
  attemptCount: messages.attemptCount,
  createdAt: messages.createdAt,
  deliveryMode: messages.deliveryMode,
  environment: messages.environment,
  failedAt: messages.failedAt,
  failureReason: messages.failureReason,
  id: messages.id,
  lastAttemptAt: messages.lastAttemptAt,
  lastErrorCode: messages.lastErrorCode,
  leaseExpiresAt: messages.leaseExpiresAt,
  nextAttemptAt: messages.nextAttemptAt,
  sentAt: messages.sentAt,
  status: messages.status,
  updatedAt: messages.updatedAt,
};

type StatusRow = Pick<
  typeof messages.$inferSelect,
  | "attemptCount"
  | "createdAt"
  | "deliveryMode"
  | "environment"
  | "failedAt"
  | "failureReason"
  | "id"
  | "lastAttemptAt"
  | "lastErrorCode"
  | "leaseExpiresAt"
  | "nextAttemptAt"
  | "sentAt"
  | "status"
  | "updatedAt"
>;

async function requireMessageRead(input: {
  actorUserId: string | null;
  orgId: string;
}): Promise<void> {
  if (!input.actorUserId) {
    throw new MessageStatusError("MEMBERSHIP_REQUIRED");
  }

  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, input.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .limit(1);

  if (!membership || !isOrgRole(membership.role)) {
    throw new MessageStatusError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, "messages.read");
}

function recordFromRow(row: StatusRow): MessageDeliveryStatusRecord {
  return {
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    deliveryMode: row.deliveryMode,
    environment: row.environment === "live" ? "live" : "test",
    failedAt: row.failedAt,
    failureReason: row.failureReason,
    id: row.id,
    lastAttemptAt: row.lastAttemptAt,
    lastErrorCode: row.lastErrorCode,
    leaseExpiresAt: row.leaseExpiresAt,
    nextAttemptAt: row.status === "queued" ? row.nextAttemptAt : null,
    sentAt: row.sentAt,
    status: row.status,
    updatedAt: row.updatedAt,
  };
}

function boundedLimit(limit: number | undefined): number {
  return Number.isInteger(limit) && limit !== undefined
    ? Math.max(1, Math.min(limit, 100))
    : 50;
}

async function listRows(
  orgId: string,
  limit?: number,
  environment?: "live" | "test",
) {
  return db
    .select(statusSelection)
    .from(messages)
    .where(
      environment
        ? and(eq(messages.orgId, orgId), eq(messages.environment, environment))
        : eq(messages.orgId, orgId),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(boundedLimit(limit));
}

async function countRows(orgId: string) {
  return db
    .select({ count: count(), status: messages.status })
    .from(messages)
    .where(eq(messages.orgId, orgId))
    .groupBy(messages.status);
}

export async function listMessageDeliveryStatuses(input: {
  actorUserId: string | null;
  environment?: "live" | "test";
  limit?: number;
  orgId: string;
}): Promise<MessageDeliveryStatusRecord[]> {
  await requireMessageRead(input);
  return (
    await listRows(input.orgId, input.limit, input.environment)
  ).map(recordFromRow);
}

export async function getMessageDeliveryStatus(input: {
  actorUserId: string | null;
  environment?: "live" | "test";
  messageId: string;
  orgId: string;
}): Promise<MessageDeliveryStatusRecord> {
  await requireMessageRead(input);

  if (!MESSAGE_ID_PATTERN.test(input.messageId)) {
    throw new MessageStatusError("MESSAGE_NOT_FOUND");
  }

  const [row] = await db
    .select(statusSelection)
    .from(messages)
    .where(
      and(
        eq(messages.id, input.messageId),
        eq(messages.orgId, input.orgId),
        input.environment
          ? eq(messages.environment, input.environment)
          : undefined,
      ),
    )
    .limit(1);

  if (!row) {
    throw new MessageStatusError("MESSAGE_NOT_FOUND");
  }

  return recordFromRow(row);
}

export async function getMessageDeliveryOverview(input: {
  actorUserId: string | null;
  limit?: number;
  orgId: string;
}): Promise<{
  counts: MessageDeliveryCounts;
  messages: MessageDeliveryStatusRecord[];
}> {
  await requireMessageRead(input);
  const [rows, groupedCounts] = await Promise.all([
    listRows(input.orgId, input.limit),
    countRows(input.orgId),
  ]);
  const counts: MessageDeliveryCounts = {
    failed: 0,
    queued: 0,
    sending: 0,
    sent: 0,
  };

  for (const row of groupedCounts) {
    counts[row.status] = Number(row.count);
  }

  return {
    counts,
    messages: rows.map(recordFromRow),
  };
}
