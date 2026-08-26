import { and, asc, eq, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { webhookDeliveries } from "@/db/schema";
import type { WebhookStore } from "@/lib/webhook-worker-core";

function validWorkerId(workerId: string): boolean {
  return (
    workerId.length >= 1 &&
    workerId.length <= 128 &&
    !/[\u0000-\u001f\u007f]/.test(workerId)
  );
}

async function markOwnedDelivery(
  input: { attemptCount: number; deliveryId: string; workerId: string },
  values: Partial<typeof webhookDeliveries.$inferInsert>,
): Promise<boolean> {
  const updated = await db
    .update(webhookDeliveries)
    .set(values)
    .where(
      and(
        eq(webhookDeliveries.id, input.deliveryId),
        eq(webhookDeliveries.attemptCount, input.attemptCount),
        eq(webhookDeliveries.status, "sending"),
        eq(webhookDeliveries.workerId, input.workerId),
      ),
    )
    .returning({ id: webhookDeliveries.id });
  return updated.length === 1;
}

export const postgresWebhookStore: WebhookStore = {
  async claim(input) {
    if (!validWorkerId(input.workerId)) {
      throw new Error("Worker ID must be 1-128 characters without controls.");
    }

    return db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ id: webhookDeliveries.id })
        .from(webhookDeliveries)
        .where(
          and(
            ...(input.deliveryId
              ? [eq(webhookDeliveries.id, input.deliveryId)]
              : []),
            or(
              and(
                eq(webhookDeliveries.status, "queued"),
                lte(webhookDeliveries.nextAttemptAt, input.now),
              ),
              and(
                eq(webhookDeliveries.status, "sending"),
                lte(webhookDeliveries.leaseExpiresAt, input.now),
              ),
            ),
          ),
        )
        .orderBy(
          asc(webhookDeliveries.nextAttemptAt),
          asc(webhookDeliveries.createdAt),
          asc(webhookDeliveries.id),
        )
        .limit(1)
        .for("update", { skipLocked: true });

      if (!candidate) {
        return null;
      }

      const [claimed] = await tx
        .update(webhookDeliveries)
        .set({
          attemptCount: sql`${webhookDeliveries.attemptCount} + 1`,
          lastAttemptAt: input.now,
          leaseExpiresAt: input.leaseExpiresAt,
          status: "sending",
          updatedAt: input.now,
          workerId: input.workerId,
        })
        .where(eq(webhookDeliveries.id, candidate.id))
        .returning({
          attemptCount: webhookDeliveries.attemptCount,
          body: webhookDeliveries.body,
          encryptedSecret: webhookDeliveries.encryptedSecret,
          endpointId: webhookDeliveries.endpointId,
          eventId: webhookDeliveries.eventId,
          id: webhookDeliveries.id,
          orgId: webhookDeliveries.orgId,
          receivedEmailId: webhookDeliveries.receivedEmailId,
          url: webhookDeliveries.url,
        });

      if (!claimed) return null;

      return {
        attemptCount: claimed.attemptCount,
        body: claimed.body,
        encryptedSecret: claimed.encryptedSecret,
        endpointId: claimed.endpointId,
        eventId: claimed.eventId ?? claimed.receivedEmailId ?? claimed.id,
        id: claimed.id,
        orgId: claimed.orgId,
        url: claimed.url,
      };
    });
  },

  markDelivered(input) {
    return markOwnedDelivery(input, {
      deliveredAt: input.now,
      failedAt: null,
      failureReason: null,
      lastErrorCode: null,
      leaseExpiresAt: null,
      responseStatus: input.responseStatus,
      status: "delivered",
      updatedAt: input.now,
      workerId: null,
    });
  },

  markFailed(input) {
    return markOwnedDelivery(input, {
      deliveredAt: null,
      failedAt: input.now,
      failureReason: input.reason,
      lastErrorCode: input.code,
      leaseExpiresAt: null,
      responseStatus: input.responseStatus,
      status: "failed",
      updatedAt: input.now,
      workerId: null,
    });
  },

  markRetry(input) {
    return markOwnedDelivery(input, {
      deliveredAt: null,
      failedAt: null,
      failureReason: input.reason,
      lastErrorCode: input.code,
      leaseExpiresAt: null,
      nextAttemptAt: input.nextAttemptAt,
      responseStatus: input.responseStatus,
      status: "queued",
      updatedAt: input.now,
      workerId: null,
    });
  },
};
