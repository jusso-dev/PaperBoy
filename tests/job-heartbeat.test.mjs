import assert from "node:assert/strict";
import test from "node:test";
import {
  JOB_HEARTBEAT_TTL_SECONDS,
  jobHeartbeatKey,
  jobsWorkerIsLive,
  memoryJobHeartbeatStore,
  touchJobHeartbeat,
} from "../src/lib/job-heartbeat.ts";

test("jobs heartbeat is live only while the TTL key exists", async () => {
  const store = memoryJobHeartbeatStore();
  const prefix = "paperboytest";

  assert.equal(await jobsWorkerIsLive({ prefix, store }), false);
  await touchJobHeartbeat({ prefix, store, workerId: "jobs-1" });
  assert.equal(await jobsWorkerIsLive({ prefix, store }), true);
  assert.equal(JOB_HEARTBEAT_TTL_SECONDS, 30);
  assert.equal(jobHeartbeatKey(prefix), "paperboytest:jobs:heartbeat");
});
