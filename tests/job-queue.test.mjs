import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const redisUrl = process.env.PAPERBOY_TEST_REDIS_URL;

test(
  "BullMQ runs delayed jobs through Bun's native Redis client",
  { skip: redisUrl ? false : "PAPERBOY_TEST_REDIS_URL is not configured" },
  async () => {
    const [{ Worker }, jobQueue] = await Promise.all([
      import("bullmq"),
      import("../src/lib/job-queue.ts"),
    ]);
    const prefix = `paperboytest${process.pid}${Date.now().toString(36)}`;
    const queues = await jobQueue.openJobQueues({
      ...process.env,
      PAPERBOY_QUEUE_PREFIX: prefix,
      REDIS_URL: redisUrl,
    });
    let worker;

    try {
      const messageId = randomUUID();
      const addedAt = Date.now();
      const delivered = new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Timed out waiting for delayed BullMQ job.")),
          5_000,
        );
        worker = new Worker(
          jobQueue.JOB_QUEUE_NAMES.messages,
          async (job) => {
            clearTimeout(timeout);
            resolve({ data: job.data, processedAt: Date.now() });
          },
          {
            connection: queues.connection,
            prefix: queues.prefix,
          },
        );
      });
      await worker.waitUntilReady();
      await queues.messages.add(
        "deliver",
        { messageId },
        { delay: 75, jobId: `message-${messageId}-0-${addedAt}` },
      );

      const result = await delivered;
      assert.deepEqual(result.data, { messageId });
      assert.equal(result.processedAt - addedAt >= 50, true);
    } finally {
      await worker?.close();
      await Promise.all([
        queues.broadcasts.obliterate({ force: true }),
        queues.maintenance.obliterate({ force: true }),
        queues.messages.obliterate({ force: true }),
        queues.webhooks.obliterate({ force: true }),
      ]);
      await jobQueue.closeJobQueues(queues);
    }
  },
);
