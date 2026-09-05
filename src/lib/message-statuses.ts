import { and, asc, count, desc, eq, gte, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, orgMembers } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
} from "@/lib/authorization";
import {
  MessageStatusError,
  type MessageDeliveryStatusFilters,
  type MessageDeliveryCounts,
  type MessageDeliveryOverviewRecord,
  type MessageDeliveryStatusRecord,
  type MessageLogOrder,
  type MessageLogSort,
} from "@/lib/message-status-core";
import { isOutboundProvider } from "@/lib/outbound-provider-core";

export type {
  MessageDeliveryCounts,
  MessageDeliveryOverviewRecord,
  MessageDeliveryStatusRecord,
} from "@/lib/message-status-core";

const MESSAGE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const statusSelection = {
  attemptCount: messages.attemptCount,
  createdAt: messages.createdAt,
  deliveryMode: messages.deliveryMode,
  domainId: messages.domainId,
  environment: messages.environment,
  failedAt: messages.failedAt,
  failureReason: messages.failureReason,
  id: messages.id,
  lastAttemptAt: messages.lastAttemptAt,
  lastErrorCode: messages.lastErrorCode,
  leaseExpiresAt: messages.leaseExpiresAt,
  nextAttemptAt: messages.nextAttemptAt,
  outboundProvider: messages.outboundProvider,
  providerMessageId: messages.providerMessageId,
  scheduledAt: messages.scheduledAt,
  cancelledAt: messages.cancelledAt,
  sentAt: messages.sentAt,
  status: messages.status,
  updatedAt: messages.updatedAt,
};

const overviewSelection = {
  ...statusSelection,
  from: messages.from,
  subject: messages.subject,
  to: messages.to,
};

type StatusRow = Pick<
  typeof messages.$inferSelect,
  | "attemptCount"
  | "createdAt"
  | "deliveryMode"
  | "domainId"
  | "environment"
  | "failedAt"
  | "failureReason"
  | "id"
  | "lastAttemptAt"
  | "lastErrorCode"
  | "leaseExpiresAt"
  | "nextAttemptAt"
  | "outboundProvider"
  | "providerMessageId"
  | "scheduledAt"
  | "cancelledAt"
  | "sentAt"
  | "status"
  | "updatedAt"
>;

type OverviewRow = StatusRow &
  Pick<typeof messages.$inferSelect, "from" | "subject" | "to">;

export async function requireMessageRead(input: {
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

function overviewFromRow(row: OverviewRow): MessageDeliveryOverviewRecord {
  return {
    ...recordFromRow(row),
    from: row.from,
    subject: row.subject,
    to: Array.isArray(row.to) ? row.to.map(String) : [],
  };
}

function recordFromRow(row: StatusRow): MessageDeliveryStatusRecord {
  return {
    attemptCount: row.attemptCount,
    createdAt: row.createdAt,
    deliveryMode: row.deliveryMode,
    domainId: row.domainId,
    environment: row.environment === "live" ? "live" : "test",
    failedAt: row.failedAt,
    failureReason: row.failureReason,
    id: row.id,
    lastAttemptAt: row.lastAttemptAt,
    lastErrorCode: row.lastErrorCode,
    leaseExpiresAt: row.leaseExpiresAt,
    nextAttemptAt: row.status === "queued" ? row.nextAttemptAt : null,
    provider: isOutboundProvider(row.outboundProvider)
      ? row.outboundProvider
      : "test-sink",
    providerMessageId: row.providerMessageId,
    scheduledAt: row.scheduledAt,
    cancelledAt: row.cancelledAt,
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

function searchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

function messageFilters(
  orgId: string,
  environment?: "live" | "test",
  filters: MessageDeliveryStatusFilters = {},
) {
  const query = filters.query?.trim();
  const pattern = query ? searchPattern(query) : null;

  return and(
    eq(messages.orgId, orgId),
    environment ? eq(messages.environment, environment) : undefined,
    filters.status ? eq(messages.status, filters.status) : undefined,
    filters.domainId ? eq(messages.domainId, filters.domainId) : undefined,
    filters.createdAtFrom
      ? gte(messages.createdAt, filters.createdAtFrom)
      : undefined,
    filters.createdAtBefore
      ? lt(messages.createdAt, filters.createdAtBefore)
      : undefined,
    pattern
      ? or(
          sql`${messages.subject} ilike ${pattern} escape '\\'`,
          sql`${messages.from} ilike ${pattern} escape '\\'`,
          sql`${messages.to}::text ilike ${pattern} escape '\\'`,
          sql`${messages.cc}::text ilike ${pattern} escape '\\'`,
          sql`${messages.bcc}::text ilike ${pattern} escape '\\'`,
          sql`${messages.tags}::text ilike ${pattern} escape '\\'`,
        )
      : undefined,
  );
}

function orderColumns(
  sort: MessageLogSort | undefined,
  order: MessageLogOrder | undefined,
) {
  const direction = order === "asc" ? asc : desc;
  switch (sort) {
    case "status":
      return [
        direction(messages.status),
        desc(messages.createdAt),
        desc(messages.id),
      ];
    case "subject":
      return [
        direction(messages.subject),
        desc(messages.createdAt),
        desc(messages.id),
      ];
    case "attempts":
      return [
        direction(messages.attemptCount),
        desc(messages.createdAt),
        desc(messages.id),
      ];
    default:
      return [direction(messages.createdAt), desc(messages.id)];
  }
}

function boundedOffset(offset: number | undefined): number {
  return Number.isInteger(offset) && offset !== undefined && offset >= 0
    ? offset
    : 0;
}

async function listRows(
  orgId: string,
  limit?: number,
  environment?: "live" | "test",
  filters: MessageDeliveryStatusFilters = {},
) {
  return db
    .select(statusSelection)
    .from(messages)
    .where(messageFilters(orgId, environment, filters))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(boundedLimit(limit));
}

async function listOverviewRows(
  orgId: string,
  limit?: number,
  filters: MessageDeliveryStatusFilters & {
    environment?: "live" | "test";
    offset?: number;
    sort?: MessageLogSort;
    sortDirection?: MessageLogOrder;
  } = {},
) {
  return db
    .select(overviewSelection)
    .from(messages)
    .where(messageFilters(orgId, filters.environment, filters))
    .orderBy(...orderColumns(filters.sort, filters.sortDirection))
    .limit(boundedLimit(limit))
    .offset(boundedOffset(filters.offset));
}

async function countMatchingRows(
  orgId: string,
  filters: MessageDeliveryStatusFilters & {
    environment?: "live" | "test";
  } = {},
) {
  const [row] = await db
    .select({ count: count() })
    .from(messages)
    .where(messageFilters(orgId, filters.environment, filters));
  return Number(row?.count ?? 0);
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
  createdAtBefore?: Date;
  createdAtFrom?: Date;
  domainId?: string;
  environment?: "live" | "test";
  limit?: number;
  orgId: string;
  status?: MessageDeliveryStatusRecord["status"];
}): Promise<MessageDeliveryStatusRecord[]> {
  await requireMessageRead(input);
  return (
    await listRows(input.orgId, input.limit, input.environment, input)
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
  createdAtBefore?: Date;
  createdAtFrom?: Date;
  domainId?: string;
  environment?: "live" | "test";
  limit?: number;
  offset?: number;
  orgId: string;
  query?: string;
  sort?: MessageLogSort;
  sortDirection?: MessageLogOrder;
  status?: MessageDeliveryStatusRecord["status"];
}): Promise<{
  counts: MessageDeliveryCounts;
  messages: MessageDeliveryOverviewRecord[];
  total: number;
}> {
  await requireMessageRead(input);
  const [rows, groupedCounts, total] = await Promise.all([
    listOverviewRows(input.orgId, input.limit, input),
    countRows(input.orgId),
    countMatchingRows(input.orgId, input),
  ]);
  const counts: MessageDeliveryCounts = {
    cancelled: 0,
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
    messages: rows.map(overviewFromRow),
    total,
  };
}
