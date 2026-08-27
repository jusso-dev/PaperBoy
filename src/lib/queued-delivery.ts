import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { enqueuePendingMessage } from "@/lib/job-queue";

export const QUEUED_SEND_BATCH = 25;

export type QueuedDispatchCounts = {
  dispatched: number;
  remaining: number;
};

export async function dispatchQueuedOrganizationMessages(input: {
  enqueue?: (messageId: string) => Promise<void>;
  limit?: number;
  orgId: string;
}): Promise<QueuedDispatchCounts> {
  const now = new Date();
  const limit =
    Number.isInteger(input.limit) && input.limit !== undefined
      ? Math.max(1, Math.min(input.limit, QUEUED_SEND_BATCH))
      : QUEUED_SEND_BATCH;
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(eq(messages.orgId, input.orgId), eq(messages.status, "queued")),
    )
    .orderBy(asc(messages.nextAttemptAt), asc(messages.createdAt), asc(messages.id))
    .limit(limit);

  if (rows.length > 0) {
    await db
      .update(messages)
      .set({ nextAttemptAt: now, updatedAt: now })
      .where(
        and(
          eq(messages.orgId, input.orgId),
          eq(messages.status, "queued"),
          inArray(
            messages.id,
            rows.map((row) => row.id),
          ),
        ),
      );
  }

  const enqueue = input.enqueue ?? enqueuePendingMessage;
  let dispatched = 0;
  for (const row of rows) {
    await enqueue(row.id);
    dispatched += 1;
  }

  const [remaining] = await db
    .select({ count: count() })
    .from(messages)
    .where(
      and(eq(messages.orgId, input.orgId), eq(messages.status, "queued")),
    );

  return {
    dispatched,
    remaining: Number(remaining?.count ?? 0),
  };
}
