import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { messages, orgMembers } from "@/db/schema";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  EmailError,
  parseRescheduledAt,
  type EmailValidationIssue,
} from "@/lib/email-core";
import { isOrgRole, requirePermission } from "@/lib/authorization";
import { removeMessageJob, requestMessageJob } from "@/lib/job-queue";
import {
  getMessageDetail,
  insertMessageEvent,
  type MessageDetailRecord,
} from "@/lib/message-events";

export class MessageLifecycleError extends Error {
  constructor(
    readonly code:
      | "MEMBERSHIP_REQUIRED"
      | "MESSAGE_NOT_FOUND"
      | "NOT_CANCELLABLE"
      | "NOT_RESCHEDULABLE"
      | "VALIDATION_ERROR",
    readonly issues: EmailValidationIssue[] = [],
  ) {
    super(code);
    this.name = "MessageLifecycleError";
  }
}

async function requireSendPermission(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  principal: ApiKeyPrincipal,
): Promise<void> {
  if (!principal.actorUserId) {
    throw new MessageLifecycleError("MEMBERSHIP_REQUIRED");
  }
  const actorUserId: string = principal.actorUserId;
  const [membership] = await tx
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, principal.orgId),
        eq(orgMembers.userId, actorUserId),
      ),
    )
    .for("share");
  if (!membership || !isOrgRole(membership.role)) {
    throw new MessageLifecycleError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, "messages.send");
}

function lifecycleContext(principal: ApiKeyPrincipal, messageId: string) {
  return {
    actorUserId: principal.actorUserId,
    environment: principal.environment,
    messageId,
    orgId: principal.orgId,
  };
}

export async function rescheduleEmail(input: {
  messageId: string;
  now?: Date;
  payload: unknown;
  principal: ApiKeyPrincipal;
}): Promise<MessageDetailRecord> {
  const now = input.now ?? new Date();
  let scheduledAt: Date | null;
  try {
    scheduledAt = parseRescheduledAt(input.payload, now);
  } catch (error) {
    if (error instanceof EmailError) {
      throw new MessageLifecycleError("VALIDATION_ERROR", error.issues);
    }
    throw error;
  }

  const locked = await db.transaction(async (tx) => {
    await requireSendPermission(tx, input.principal);
    const [row] = await tx
      .select({
        apiKeyId: messages.apiKeyId,
        id: messages.id,
        nextAttemptAt: messages.nextAttemptAt,
        status: messages.status,
      })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.orgId, input.principal.orgId),
          eq(messages.environment, input.principal.environment),
        ),
      )
      .for("update");
    if (!row) throw new MessageLifecycleError("MESSAGE_NOT_FOUND");
    if (row.status !== "queued") {
      throw new MessageLifecycleError("NOT_RESCHEDULABLE");
    }
    const previousRunAt = row.nextAttemptAt;
    await tx
      .update(messages)
      .set({
        nextAttemptAt: scheduledAt ?? now,
        scheduledAt,
        updatedAt: now,
      })
      .where(eq(messages.id, row.id));
    return { nextAttemptAt: previousRunAt };
  });

  await removeMessageJob({
    attemptCount: 0,
    messageId: input.messageId,
    runAt: locked.nextAttemptAt,
  });
  requestMessageJob({
    attemptCount: 0,
    messageId: input.messageId,
    runAt: scheduledAt ?? now,
  });

  return getMessageDetail(lifecycleContext(input.principal, input.messageId));
}

export async function cancelEmail(input: {
  messageId: string;
  now?: Date;
  principal: ApiKeyPrincipal;
}): Promise<MessageDetailRecord> {
  const now = input.now ?? new Date();

  const locked = await db.transaction(async (tx) => {
    await requireSendPermission(tx, input.principal);
    const [row] = await tx
      .select({
        createdAt: messages.createdAt,
        id: messages.id,
        nextAttemptAt: messages.nextAttemptAt,
        status: messages.status,
      })
      .from(messages)
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.orgId, input.principal.orgId),
          eq(messages.environment, input.principal.environment),
        ),
      )
      .for("update");
    if (!row) throw new MessageLifecycleError("MESSAGE_NOT_FOUND");
    if (row.status !== "queued") {
      throw new MessageLifecycleError("NOT_CANCELLABLE");
    }
    await tx
      .update(messages)
      .set({
        cancelledAt: now,
        leaseExpiresAt: null,
        status: "cancelled",
        updatedAt: now,
        workerId: null,
      })
      .where(eq(messages.id, row.id));
    await insertMessageEvent(tx, {
      createdAt: now,
      data: {},
      messageId: row.id,
      type: "cancelled",
    });
    return { nextAttemptAt: row.nextAttemptAt };
  });

  await removeMessageJob({
    attemptCount: 0,
    messageId: input.messageId,
    runAt: locked.nextAttemptAt,
  });

  return getMessageDetail(lifecycleContext(input.principal, input.messageId));
}
