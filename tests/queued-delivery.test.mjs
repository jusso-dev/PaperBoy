import assert from "node:assert/strict";
import test from "node:test";

process.env.DATABASE_URL ??= "postgres://paperboy@127.0.0.1:5433/paperboy";

test("web fallback skips delivery when the jobs worker is live", async () => {
  const { deliverQueuedMessageIfJobsDown } = await import(
    "../src/lib/queued-delivery.ts"
  );
  const calls = [];
  const result = await deliverQueuedMessageIfJobsDown(
    "11111111-1111-4111-8111-111111111111",
    {
      deliver: async (input) => {
        calls.push(input.messageId);
        return { state: "sent", messageId: input.messageId };
      },
      jobsLive: async () => true,
    },
  );

  assert.deepEqual(result, { state: "skipped" });
  assert.deepEqual(calls, []);
});

test("web fallback delivers the queued message when the jobs worker is down", async () => {
  const { deliverQueuedMessageIfJobsDown } = await import(
    "../src/lib/queued-delivery.ts"
  );
  const calls = [];
  const result = await deliverQueuedMessageIfJobsDown(
    "11111111-1111-4111-8111-111111111111",
    {
      deliver: async (input) => {
        calls.push(input.messageId);
        return { state: "sent", messageId: input.messageId };
      },
      jobsLive: async () => false,
    },
  );

  assert.deepEqual(result, {
    messageId: "11111111-1111-4111-8111-111111111111",
    state: "sent",
  });
  assert.deepEqual(calls, ["11111111-1111-4111-8111-111111111111"]);
});
