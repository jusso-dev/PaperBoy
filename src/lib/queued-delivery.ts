import { hostname } from "node:os";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { messages } from "@/db/schema";
import { jobsWorkerIsLive } from "@/lib/job-heartbeat";
import { createEnvironmentOutboundRouter } from "@/lib/outbound-provider-runtime";
import { postgresAwsSesQuotaGuard } from "@/lib/postgres-aws-ses-quota-guard";
import { postgresWorkerStore } from "@/lib/postgres-worker-store";
import {
  processNextMessage,
  type WorkerResult,
} from "@/lib/worker-core";

export const QUEUED_SEND_BATCH = 25;

export type QueuedDeliveryCounts = {
  delivered: number;
  failed: number;
  idle: number;
  remaining: number;
  retried: number;
};

function workerName(value: string): string {
  return value.slice(0, 128);
}

export async function deliverQueuedMessage(input: {
  deliver?: typeof processNextMessage;
  messageId: string;
  workerId: string;
}): Promise<WorkerResult> {
  const deliver = input.deliver ?? processNextMessage;
  const adapter = createEnvironmentOutboundRouter({
    awsSesQuotaGuard: postgresAwsSesQuotaGuard,
  });
  try {
    return await deliver({
      adapter,
      deliveryModes: ["live", "test-sink"],
      messageId: input.messageId,
      store: postgresWorkerStore,
      workerId: workerName(input.workerId),
    });
  } finally {
    adapter.close();
  }
}

export function requestQueuedDelivery(messageId: string): void {
  void deliverQueuedMessageIfJobsDown(messageId).catch(() => {
    console.error(
      `PaperBoy could not deliver ${messageId} from the web process; the jobs worker or a later retry will send it.`,
    );
  });
}

export async function deliverQueuedMessageIfJobsDown(
  messageId: string,
  options: {
    deliver?: typeof processNextMessage;
    jobsLive?: () => Promise<boolean>;
  } = {},
): Promise<WorkerResult | { state: "skipped" }> {
  const jobsLive = options.jobsLive ?? jobsWorkerIsLive;
  if (await jobsLive()) return { state: "skipped" };

  return deliverQueuedMessage({
    ...(options.deliver ? { deliver: options.deliver } : {}),
    messageId,
    workerId: `web-fallback:${hostname()}:${process.pid}`,
  });
}

export async function deliverQueuedOrganizationMessages(input: {
  deliver?: typeof processNextMessage;
  limit?: number;
  orgId: string;
  workerId: string;
}): Promise<QueuedDeliveryCounts> {
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

  const counts: QueuedDeliveryCounts = {
    delivered: 0,
    failed: 0,
    idle: 0,
    remaining: 0,
    retried: 0,
  };
  const adapter = createEnvironmentOutboundRouter({
    awsSesQuotaGuard: postgresAwsSesQuotaGuard,
  });
  const deliver = input.deliver ?? processNextMessage;

  try {
    for (const row of rows) {
      const result = await deliver({
        adapter,
        deliveryModes: ["live", "test-sink"],
        messageId: row.id,
        store: postgresWorkerStore,
        workerId: workerName(input.workerId),
      });
      if (result.state === "sent") counts.delivered += 1;
      else if (result.state === "failed") counts.failed += 1;
      else if (result.state === "retry") counts.retried += 1;
      else counts.idle += 1;
    }
  } finally {
    adapter.close();
  }

  const [remaining] = await db
    .select({ count: count() })
    .from(messages)
    .where(
      and(eq(messages.orgId, input.orgId), eq(messages.status, "queued")),
    );
  counts.remaining = Number(remaining?.count ?? 0);
  return counts;
}
