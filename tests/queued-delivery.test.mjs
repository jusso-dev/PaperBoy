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
