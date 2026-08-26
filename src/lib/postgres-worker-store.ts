import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import type { MessageDeliveryMode } from "@/lib/email-core";
import { insertMessageEvent } from "@/lib/message-events";
import { isOutboundProvider } from "@/lib/outbound-provider-core";
import { loadMessageAttachments } from "@/lib/stored-message-attachments";
import type { WorkerStore } from "@/lib/worker-core";

function validWorkerId(workerId: string): boolean {
  return (
    workerId.length >= 1 &&
    workerId.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(workerId)
  );
}

function deliveryMode(value: string): MessageDeliveryMode {
  return value === "live" ? "live" : "test-sink";
}

function outboundProvider(value: string) {
  return isOutboundProvider(value) ? value : "test-sink";
}

async function markOwnedMessage(
  input: { attemptCount: number; messageId: string; workerId: string },
  values: Partial<typeof messages.$inferInsert>,
): Promise<boolean> {
  const updated = await db
    .update(messages)
    .set(values)
    .where(
      and(
        eq(messages.id, input.messageId),
        eq(messages.attemptCount, input.attemptCount),
        eq(messages.status, "sending"),
        eq(messages.workerId, input.workerId),
      ),
    )
    .returning({ id: messages.id });
  return updated.length === 1;
}

export const postgresWorkerStore: WorkerStore = {
  async claim(input) {
    if (!validWorkerId(input.workerId)) {
      throw new Error("Worker ID must be 1-128 characters without controls.");
    }

    if (input.deliveryModes.length === 0) {
      return null;
    }

    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            ...(input.messageId ? [eq(messages.id, input.messageId)] : []),
            inArray(messages.deliveryMode, input.deliveryModes),
            or(
              and(
                eq(messages.status, "queued"),
                lte(messages.nextAttemptAt, input.now),
              ),
              and(
                eq(messages.status, "sending"),
                lte(messages.leaseExpiresAt, input.now),
              ),
            ),
          ),
        )
        .orderBy(
          asc(messages.nextAttemptAt),
          asc(messages.createdAt),
          asc(messages.id),
        )
        .limit(1)
        .for("update", { skipLocked: true });

      if (!candidate) {
        return null;
      }

      const [claimed] = await tx
        .update(messages)
        .set({
          attemptCount: sql`${messages.attemptCount} + 1`,
          lastAttemptAt: input.now,
          leaseExpiresAt: input.leaseExpiresAt,
          status: "sending",
          updatedAt: input.now,
          workerId: input.workerId,
        })
        .where(eq(messages.id, candidate.id))
        .returning({
          attemptCount: messages.attemptCount,
          deliveryMode: messages.deliveryMode,
          environment: messages.environment,
          from: messages.from,
          html: messages.html,
          id: messages.id,
          replyTo: messages.replyTo,
          orgId: messages.orgId,
          provider: messages.outboundProvider,
          subject: messages.subject,
          text: messages.textBody,
          to: messages.to,
        });

      if (!claimed) {
        return null;
      }

      return {
        ...claimed,
        deliveryMode: deliveryMode(claimed.deliveryMode),
        environment: claimed.environment === "live" ? "live" : "test",
        provider: outboundProvider(claimed.provider),
      };
    });
  },

  async loadAttachments(messageId) {
    const attachments = await loadMessageAttachments({ messageId });
    return attachments.map((attachment) => ({
      content: attachment.content,
      contentType: attachment.contentType,
      filename: attachment.filename,
    }));
  },

  markFailed(input) {
    return markOwnedMessage(input, {
      failedAt: input.now,
      failureReason: input.reason,
      lastErrorCode: input.code,
      leaseExpiresAt: null,
      status: "failed",
      updatedAt: input.now,
      workerId: null,
    });
  },

  async markRetry(input) {
    const updated = await db
      .update(messages)
      .set({
        ...(input.consumeAttempt
          ? {}
          : { attemptCount: sql`${messages.attemptCount} - 1` }),
        failureReason: input.reason,
        lastErrorCode: input.code,
        leaseExpiresAt: null,
        nextAttemptAt: input.nextAttemptAt,
        status: "queued",
        updatedAt: input.now,
        workerId: null,
      })
      .where(
        and(
          eq(messages.id, input.messageId),
          eq(messages.attemptCount, input.attemptCount),
          eq(messages.status, "sending"),
          eq(messages.workerId, input.workerId),
        ),
      )
      .returning({ id: messages.id });
    return updated.length === 1;
  },

  markSent(input) {
    return db.transaction(async (tx) => {
      const [updated] = await tx
        .update(messages)
        .set({
          failedAt: null,
          failureReason: null,
          lastErrorCode: null,
          leaseExpiresAt: null,
          providerMessageId: input.providerMessageId,
          sentAt: input.now,
          status: "sent",
          updatedAt: input.now,
          workerId: null,
        })
        .where(
          and(
            eq(messages.id, input.messageId),
            eq(messages.attemptCount, input.attemptCount),
            eq(messages.status, "sending"),
            eq(messages.workerId, input.workerId),
          ),
        )
        .returning({ id: messages.id });

      if (!updated) {
        return false;
      }

      await insertMessageEvent(tx, {
        createdAt: input.now,
        data: {},
        messageId: input.messageId,
        type: "delivered",
      });
      return true;
    });
  },
};
