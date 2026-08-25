import { RedisClient } from "bun";
import {
  Queue,
  createBunRedisClient,
  type IRedisClient,
} from "bullmq";
import { and, asc, eq, inArray, lte, or } from "drizzle-orm";
import { db } from "@/db";
import { broadcasts, messages, webhookDeliveries } from "@/db/schema";

export const JOB_QUEUE_NAMES = {
  broadcasts: "broadcasts",
  maintenance: "maintenance",
  messages: "messages",
  webhooks: "webhooks",
} as const;

export type BroadcastJobData = {
  broadcastId: string;
  orgId: string;
};

export type MaintenanceJobData = Record<string, never>;

export type MessageJobData = {
  messageId: string;
};

export type WebhookJobData = {
  deliveryId: string;
};

export type JobQueueBundle = {
  broadcasts: Queue<BroadcastJobData, void, "process">;
  connection: IRedisClient;
  maintenance: Queue<MaintenanceJobData, void, "reconcile">;
  messages: Queue<MessageJobData, void, "deliver">;
  prefix: string;
  webhooks: Queue<WebhookJobData, void, "deliver">;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUEUE_PREFIX_PATTERN = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const DEFAULT_RECONCILE_LIMIT = 250;

let sharedQueues: Promise<JobQueueBundle> | null = null;

function configuredRedisUrl(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = environment.REDIS_URL?.trim();

  if (!value) {
    throw new Error("REDIS_URL is required for PaperBoy jobs.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("REDIS_URL must be a valid Redis URL.");
  }

  if (!['redis:', 'rediss:'].includes(url.protocol) || url.hash) {
    throw new Error("REDIS_URL must use redis:// or rediss:// without a fragment.");
  }

  return value;
}

function configuredQueuePrefix(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): string {
  const value = environment.PAPERBOY_QUEUE_PREFIX?.trim() || "paperboy";

  if (!QUEUE_PREFIX_PATTERN.test(value)) {
    throw new Error(
      "PAPERBOY_QUEUE_PREFIX must be 1-40 lowercase letters, digits, underscores, or hyphens.",
    );
  }

  return value;
}

function requireUuid(value: string, field: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new Error(`${field} must be a UUID.`);
  }
}

function validRunAt(runAt: Date): Date {
  if (!Number.isFinite(runAt.getTime())) {
    throw new Error("Job run time must be a valid instant.");
  }

  return runAt;
}

function delayUntil(runAt: Date, now = new Date()): number {
  return Math.max(0, validRunAt(runAt).getTime() - now.getTime());
}

function versionedJobId(input: {
  attemptCount: number;
  entityId: string;
  kind: "message" | "webhook";
  runAt: Date;
}): string {
  return `${input.kind}-${input.entityId}-${input.attemptCount}-${validRunAt(input.runAt).getTime()}`;
}

function reconcileLimit(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): number {
  const parsed = Number(
    environment.PAPERBOY_JOB_RECONCILE_LIMIT ?? DEFAULT_RECONCILE_LIMIT,
  );
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 1_000
    ? parsed
    : DEFAULT_RECONCILE_LIMIT;
}

export function jobQueueConfigured(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return (
    Boolean(environment.REDIS_URL?.trim()) &&
    environment.PAPERBOY_INLINE_JOB_DISPATCH !== "false"
  );
}

export async function openJobQueues(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<JobQueueBundle> {
  const prefix = configuredQueuePrefix(environment);
  const rawClient = new RedisClient(configuredRedisUrl(environment));
  const connection = createBunRedisClient(rawClient);
  const common = {
    connection,
    prefix,
  };
  const defaultJobOptions = {
    attempts: 10,
    backoff: { delay: 1_000, type: "exponential" as const },
    removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
    removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
    sizeLimit: 8_192,
  };

  return {
    broadcasts: new Queue<BroadcastJobData, void, "process">(
      JOB_QUEUE_NAMES.broadcasts,
      {
        ...common,
        defaultJobOptions: {
          ...defaultJobOptions,
          removeOnComplete: true,
        },
      },
    ),
    connection,
    maintenance: new Queue<MaintenanceJobData, void, "reconcile">(
      JOB_QUEUE_NAMES.maintenance,
      { ...common, defaultJobOptions },
    ),
    messages: new Queue<MessageJobData, void, "deliver">(
      JOB_QUEUE_NAMES.messages,
      { ...common, defaultJobOptions },
    ),
    prefix,
    webhooks: new Queue<WebhookJobData, void, "deliver">(
      JOB_QUEUE_NAMES.webhooks,
      { ...common, defaultJobOptions },
    ),
  };
}

export function getJobQueues(): Promise<JobQueueBundle> {
  sharedQueues ??= openJobQueues();
  return sharedQueues;
}

export async function closeJobQueues(
  queues: JobQueueBundle,
): Promise<void> {
  await Promise.all([
    queues.broadcasts.close(),
    queues.maintenance.close(),
    queues.messages.close(),
    queues.webhooks.close(),
  ]);
  await queues.connection.quit();

  if (sharedQueues && (await sharedQueues) === queues) {
    sharedQueues = null;
  }
}

export async function enqueueMessageJob(input: {
  attemptCount: number;
  messageId: string;
  runAt: Date;
}): Promise<void> {
  requireUuid(input.messageId, "Message ID");
  const queues = await getJobQueues();
  await queues.messages.add(
    "deliver",
    { messageId: input.messageId },
    {
      delay: delayUntil(input.runAt),
      jobId: versionedJobId({
        attemptCount: input.attemptCount,
        entityId: input.messageId,
        kind: "message",
        runAt: input.runAt,
      }),
    },
  );
}

export async function enqueueBroadcastJob(input: {
  broadcastId: string;
  orgId: string;
  runAt: Date;
}): Promise<void> {
  requireUuid(input.broadcastId, "Broadcast ID");
  requireUuid(input.orgId, "Organization ID");
  const queues = await getJobQueues();
  const jobId = `broadcast-${input.broadcastId}`;
  const delay = delayUntil(input.runAt);
  const existing = await queues.broadcasts.getJob(jobId);
  if (existing) {
    const state = await existing.getState();
    if (state === "delayed") {
      await existing.changeDelay(delay);
      return;
    }
    if (["active", "waiting", "waiting-children", "prioritized"].includes(state)) {
      return;
    }
    await existing.remove();
  }
  await queues.broadcasts.add(
    "process",
    { broadcastId: input.broadcastId, orgId: input.orgId },
    {
      delay,
      jobId,
    },
  );
}

export async function enqueueWebhookJob(input: {
  attemptCount: number;
  deliveryId: string;
  runAt: Date;
}): Promise<void> {
  requireUuid(input.deliveryId, "Webhook delivery ID");
  const queues = await getJobQueues();
  await queues.webhooks.add(
    "deliver",
    { deliveryId: input.deliveryId },
    {
      delay: delayUntil(input.runAt),
      jobId: versionedJobId({
        attemptCount: input.attemptCount,
        entityId: input.deliveryId,
        kind: "webhook",
        runAt: input.runAt,
      }),
    },
  );
}

export function requestMessageJob(input: {
  attemptCount: number;
  messageId: string;
  runAt: Date;
}): void {
  if (!jobQueueConfigured()) return;
  void enqueueMessageJob(input).catch(() => {
    console.error(
      `PaperBoy could not dispatch message job ${input.messageId}; BullMQ reconciliation will retry it.`,
    );
  });
}

export function requestBroadcastJob(input: {
  broadcastId: string;
  orgId: string;
  runAt: Date;
}): void {
  if (!jobQueueConfigured()) return;
  void enqueueBroadcastJob(input).catch(() => {
    console.error(
      `PaperBoy could not dispatch broadcast job ${input.broadcastId}; BullMQ reconciliation will retry it.`,
    );
  });
}

export async function enqueuePendingMessage(messageId: string): Promise<void> {
  requireUuid(messageId, "Message ID");
  const now = new Date();
  const [message] = await db
    .select({
      attemptCount: messages.attemptCount,
      leaseExpiresAt: messages.leaseExpiresAt,
      nextAttemptAt: messages.nextAttemptAt,
      status: messages.status,
    })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);

  if (!message) return;
  const runAt =
    message.status === "queued"
      ? message.nextAttemptAt
      : message.status === "sending" &&
          message.leaseExpiresAt &&
          message.leaseExpiresAt <= now
        ? message.leaseExpiresAt
        : null;
  if (!runAt) return;
  await enqueueMessageJob({
    attemptCount: message.attemptCount,
    messageId,
    runAt,
  });
}

export async function enqueuePendingWebhook(deliveryId: string): Promise<void> {
  requireUuid(deliveryId, "Webhook delivery ID");
  const now = new Date();
  const [delivery] = await db
    .select({
      attemptCount: webhookDeliveries.attemptCount,
      leaseExpiresAt: webhookDeliveries.leaseExpiresAt,
      nextAttemptAt: webhookDeliveries.nextAttemptAt,
      status: webhookDeliveries.status,
    })
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.id, deliveryId))
    .limit(1);

  if (!delivery) return;
  const runAt =
    delivery.status === "queued"
      ? delivery.nextAttemptAt
      : delivery.status === "sending" &&
          delivery.leaseExpiresAt &&
          delivery.leaseExpiresAt <= now
        ? delivery.leaseExpiresAt
        : null;
  if (!runAt) return;
  await enqueueWebhookJob({
    attemptCount: delivery.attemptCount,
    deliveryId,
    runAt,
  });
}

export async function reconcilePendingJobs(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<{ broadcasts: number; messages: number; webhooks: number }> {
  const now = new Date();
  const limit = reconcileLimit(environment);
  const [messageRows, broadcastRows, webhookRows] = await Promise.all([
    db
      .select({
        attemptCount: messages.attemptCount,
        id: messages.id,
        leaseExpiresAt: messages.leaseExpiresAt,
        nextAttemptAt: messages.nextAttemptAt,
        status: messages.status,
      })
      .from(messages)
      .where(
        or(
          eq(messages.status, "queued"),
          and(
            eq(messages.status, "sending"),
            lte(messages.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(asc(messages.nextAttemptAt), asc(messages.createdAt))
      .limit(limit),
    db
      .select({
        id: broadcasts.id,
        orgId: broadcasts.orgId,
        scheduledFor: broadcasts.scheduledFor,
        status: broadcasts.status,
      })
      .from(broadcasts)
      .where(inArray(broadcasts.status, ["running", "scheduled"]))
      .orderBy(asc(broadcasts.scheduledFor), asc(broadcasts.createdAt))
      .limit(limit),
    db
      .select({
        attemptCount: webhookDeliveries.attemptCount,
        id: webhookDeliveries.id,
        leaseExpiresAt: webhookDeliveries.leaseExpiresAt,
        nextAttemptAt: webhookDeliveries.nextAttemptAt,
        status: webhookDeliveries.status,
      })
      .from(webhookDeliveries)
      .where(
        or(
          eq(webhookDeliveries.status, "queued"),
          and(
            eq(webhookDeliveries.status, "sending"),
            lte(webhookDeliveries.leaseExpiresAt, now),
          ),
        ),
      )
      .orderBy(
        asc(webhookDeliveries.nextAttemptAt),
        asc(webhookDeliveries.createdAt),
      )
      .limit(limit),
  ]);

  await Promise.all([
    ...messageRows.map((message) =>
      enqueueMessageJob({
        attemptCount: message.attemptCount,
        messageId: message.id,
        runAt:
          message.status === "sending" && message.leaseExpiresAt
            ? message.leaseExpiresAt
            : message.nextAttemptAt,
      }),
    ),
    ...broadcastRows.map((broadcast) =>
      enqueueBroadcastJob({
        broadcastId: broadcast.id,
        orgId: broadcast.orgId,
        runAt:
          broadcast.status === "scheduled" && broadcast.scheduledFor
            ? broadcast.scheduledFor
            : now,
      }),
    ),
    ...webhookRows.map((delivery) =>
      enqueueWebhookJob({
        attemptCount: delivery.attemptCount,
        deliveryId: delivery.id,
        runAt:
          delivery.status === "sending" && delivery.leaseExpiresAt
            ? delivery.leaseExpiresAt
            : delivery.nextAttemptAt,
      }),
    ),
  ]);

  return {
    broadcasts: broadcastRows.length,
    messages: messageRows.length,
    webhooks: webhookRows.length,
  };
}
