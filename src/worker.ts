import { hostname } from "node:os";
import { config } from "dotenv";

config({ quiet: true });

function pollInterval(): number {
  const parsed = Number(process.env.PAPERBOY_WORKER_POLL_MS ?? "1000");
  return Number.isInteger(parsed) && parsed >= 100 && parsed <= 60_000
    ? parsed
    : 1000;
}

function workerIdentity(): string {
  const fallback = `${hostname()}:${process.pid}`.slice(0, 128);
  const workerId = process.env.PAPERBOY_WORKER_ID ?? fallback;

  if (
    workerId.length < 1 ||
    workerId.length > 128 ||
    /[\u0000-\u001f\u007f]/.test(workerId)
  ) {
    throw new Error("Invalid PAPERBOY_WORKER_ID.");
  }

  return workerId;
}

async function main() {
  const [{ postgresWorkerStore }, { processNextMessage, testSinkAdapter }] =
    await Promise.all([
      import("@/lib/postgres-worker-store"),
      import("@/lib/worker-core"),
    ]);
  const workerId = workerIdentity();
  const pollMs = pollInterval();
  let stopping = false;

  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.error(`PaperBoy worker ${workerId} ready for test-sink delivery.`);

  while (!stopping) {
    const result = await processNextMessage({
      adapter: testSinkAdapter,
      deliveryModes: ["test-sink"],
      store: postgresWorkerStore,
      workerId,
    });

    if (result.state === "idle") {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  }

  console.error(`PaperBoy worker ${workerId} stopped.`);
}

void main().catch(() => {
  console.error(
    "PaperBoy worker stopped after an internal error. Check DATABASE_URL, migrations, attachment storage, and worker logs.",
  );
  process.exitCode = 1;
});
