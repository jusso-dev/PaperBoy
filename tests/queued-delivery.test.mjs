import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("queued dispatch goes to BullMQ instead of the web process", async () => {
  const [delivery, actions, jobs, queue] = await Promise.all([
    readFile(new URL("../src/lib/queued-delivery.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/app/app/logs/actions.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/jobs.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/lib/job-queue.ts", import.meta.url), "utf8"),
  ]);

  assert.match(delivery, /enqueuePendingMessage/);
  assert.match(delivery, /dispatchQueuedOrganizationMessages/);
  assert.doesNotMatch(delivery, /processNextMessage/);
  assert.doesNotMatch(delivery, /web-fallback/);
  assert.match(actions, /dispatchQueuedOrganizationMessages/);
  assert.match(jobs, /result.state === "idle"/);
  assert.match(jobs, /enqueuePendingMessage\(job.data.messageId\)/);
  assert.match(queue, /replaceFinishedVersionedJob/);
  assert.match(queue, /existing.remove/);
});

test("rate-limited broadcasts stay on the jobs worker instead of pausing", async () => {
  const source = await readFile(
    new URL("../src/lib/broadcasts.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /deferRateLimitedBroadcast/);
  assert.match(source, /retryAfterSeconds: error.retryAfterSeconds/);
  assert.match(source, /status: "scheduled"/);
  assert.match(source, /requestBroadcastJob/);
  assert.doesNotMatch(source, /pauseRateLimitedRecipient/);
});
