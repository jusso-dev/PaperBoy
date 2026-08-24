import { hostname } from "node:os";
import { Worker } from "bullmq";
import {
  JOB_QUEUE_NAMES,
  closeJobQueues,
  enqueuePendingMessage,
  enqueuePendingWebhook,
  getJobQueues,
  reconcilePendingJobs,
  type BroadcastJobData,
  type MaintenanceJobData,
  type MessageJobData,
  type WebhookJobData,
} from "@/lib/job-queue";

function positiveInteger(
  name: string,
  fallback: number,
  maximum: number,
): number {
  const parsed = Number(process.env[name] ?? fallback);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maximum
    ? parsed
    : fallback;
}

function workerIdentity(): string {
  const fallback = `${hostname()}:${process.pid}`.slice(0, 96);
  const workerId = process.env.PAPERBOY_JOB_WORKER_ID ?? fallback;

  if (
    workerId.length < 1 ||
    workerId.length > 96 ||
    /[\u0000-\u001f\u007f]/.test(workerId)
  ) {
    throw new Error("Invalid PAPERBOY_JOB_WORKER_ID.");
  }

  return workerId;
}

async function main() {
  const [
    queues,
    { db },
    { postgresWorkerStore },
    { postgresAwsSesQuotaGuard },
    { postgresWebhookStore },
    { processBroadcastJob },
    { processNextMessage, DELIVERY_LEASE_MS },
    { createEnvironmentOutboundRouter },
    { configuredWebhookEncryptionKey },
    { processNextWebhook },
  ] = await Promise.all([
    getJobQueues(),
    import("@/db"),
    import("@/lib/postgres-worker-store"),
    import("@/lib/postgres-aws-ses-quota-guard"),
    import("@/lib/postgres-webhook-store"),
    import("@/lib/broadcasts"),
    import("@/lib/worker-core"),
    import("@/lib/outbound-provider-runtime"),
    import("@/lib/webhook-core"),
    import("@/lib/webhook-worker-core"),
  ]);
  const workerId = workerIdentity();
  const adapter = createEnvironmentOutboundRouter({
    awsSesQuotaGuard: postgresAwsSesQuotaGuard,
    environment: process.env,
  });
  const webhookEncryptionKey = process.env.PAPERBOY_WEBHOOK_ENCRYPTION_KEY
    ? configuredWebhookEncryptionKey()
    : null;
  const common = {
    connection: queues.connection,
    lockDuration: DELIVERY_LEASE_MS,
    maxStalledCount: 2,
    prefix: queues.prefix,
  };
  const workers = [
    new Worker<MessageJobData, void, "deliver">(
      JOB_QUEUE_NAMES.messages,
      async (job) => {
        const result = await processNextMessage({
          adapter,
          deliveryModes: ["live", "test-sink"],
          messageId: job.data.messageId,
          store: postgresWorkerStore,
          workerId: `${workerId}:message`.slice(0, 128),
        });
        if (result.state === "retry") {
          await enqueuePendingMessage(result.messageId);
        }
      },
      {
        ...common,
        concurrency: positiveInteger(
          "PAPERBOY_MESSAGE_JOB_CONCURRENCY",
          5,
          100,
        ),
        name: `${workerId}:messages`,
      },
    ),
    new Worker<BroadcastJobData, void, "process">(
      JOB_QUEUE_NAMES.broadcasts,
      async (job) => {
        await processBroadcastJob(job.data);
      },
      {
        ...common,
        concurrency: positiveInteger(
          "PAPERBOY_BROADCAST_JOB_CONCURRENCY",
          1,
          10,
        ),
        name: `${workerId}:broadcasts`,
      },
    ),
    new Worker<MaintenanceJobData, void, "reconcile">(
      JOB_QUEUE_NAMES.maintenance,
      async () => {
        await reconcilePendingJobs();
      },
      {
        ...common,
        concurrency: 1,
        name: `${workerId}:maintenance`,
      },
    ),
    ...(webhookEncryptionKey
      ? [
          new Worker<WebhookJobData, void, "deliver">(
            JOB_QUEUE_NAMES.webhooks,
            async (job) => {
              const result = await processNextWebhook({
                deliveryId: job.data.deliveryId,
                encryptionKey: webhookEncryptionKey,
                store: postgresWebhookStore,
                workerId: `${workerId}:webhook`.slice(0, 128),
              });
              if (result.state === "retry") {
                await enqueuePendingWebhook(result.deliveryId);
              }
            },
            {
              ...common,
              concurrency: positiveInteger(
                "PAPERBOY_WEBHOOK_JOB_CONCURRENCY",
                5,
                100,
              ),
              name: `${workerId}:webhooks`,
            },
          ),
        ]
      : []),
  ];

  for (const worker of workers) {
    worker.on("error", () => {
      console.error("PaperBoy BullMQ worker encountered a Redis error.");
    });
    worker.on("failed", (job) => {
      console.error(
        `PaperBoy BullMQ job ${job?.id ?? "unknown"} failed; bounded retry or reconciliation remains active.`,
      );
    });
  }

  const reconcileEveryMs = positiveInteger(
    "PAPERBOY_JOB_RECONCILE_MS",
    5_000,
    60_000,
  );
  await queues.maintenance.upsertJobScheduler(
    "reconcile",
    { every: reconcileEveryMs },
    {
      data: {},
      name: "reconcile",
      opts: {
        attempts: 10,
        backoff: { delay: 1_000, type: "exponential" },
      },
    },
  );
  await reconcilePendingJobs();
  await Promise.all(workers.map((worker) => worker.waitUntilReady()));

  console.error(
    `PaperBoy BullMQ jobs ${workerId} ready; message concurrency ${positiveInteger("PAPERBOY_MESSAGE_JOB_CONCURRENCY", 5, 100)}, broadcast concurrency ${positiveInteger("PAPERBOY_BROADCAST_JOB_CONCURRENCY", 1, 10)}, signed webhooks ${webhookEncryptionKey ? "enabled" : "disabled"}.`,
  );

  await new Promise<void>((resolve) => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  console.error(`PaperBoy BullMQ jobs ${workerId} stopping.`);
  await Promise.all(workers.map((worker) => worker.close()));
  adapter.close();
  await closeJobQueues(queues);
  await db.$client.close();
}

void main().catch(() => {
  console.error(
    "PaperBoy BullMQ jobs stopped after an internal error. Check REDIS_URL, Redis noeviction persistence, DATABASE_URL, migrations, outbound provider, attachment storage, webhook secret, connectivity, and job logs.",
  );
  process.exitCode = 1;
});
