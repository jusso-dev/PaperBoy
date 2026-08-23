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
  const [
    { postgresWorkerStore },
    { postgresWebhookStore },
    { processNextMessage, routeOutboundAdapters, testSinkAdapter },
    { createSmtpAdapter },
    { configuredWebhookEncryptionKey },
    { processNextWebhook },
  ] = await Promise.all([
      import("@/lib/postgres-worker-store"),
      import("@/lib/postgres-webhook-store"),
      import("@/lib/worker-core"),
      import("@/lib/smtp-adapter"),
      import("@/lib/webhook-core"),
      import("@/lib/webhook-worker-core"),
    ]);
  const workerId = workerIdentity();
  const pollMs = pollInterval();
  const smtp =
    process.env.SMTP_URL === undefined
      ? null
      : createSmtpAdapter({ environment: process.env });
  const adapter = routeOutboundAdapters({
    live: smtp ?? undefined,
    "test-sink": testSinkAdapter,
  });
  const deliveryModes = smtp
    ? (["live", "test-sink"] as const)
    : (["test-sink"] as const);
  const webhookEncryptionKey = process.env.PAPERBOY_WEBHOOK_ENCRYPTION_KEY
    ? configuredWebhookEncryptionKey()
    : null;
  let stopping = false;

  const stop = () => {
    stopping = true;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    if (smtp) {
      await smtp.verify();
    }

    console.error(
      `PaperBoy worker ${workerId} ready for ${smtp ? "SMTP and test-sink" : "test-sink"} delivery; signed webhooks ${webhookEncryptionKey ? "enabled" : "disabled"}.`,
    );

    while (!stopping) {
      const result = await processNextMessage({
        adapter,
        deliveryModes: [...deliveryModes],
        store: postgresWorkerStore,
        workerId,
      });
      const webhookResult = webhookEncryptionKey
        ? await processNextWebhook({
            encryptionKey: webhookEncryptionKey,
            store: postgresWebhookStore,
            workerId,
          })
        : ({ state: "idle" } as const);

      if (result.state === "idle" && webhookResult.state === "idle") {
        await new Promise((resolve) => setTimeout(resolve, pollMs));
      }
    }

    console.error(`PaperBoy worker ${workerId} stopped.`);
  } finally {
    smtp?.close();
  }
}

void main().catch(() => {
  console.error(
    "PaperBoy worker stopped after an internal error. Check DATABASE_URL, migrations, attachment storage, SMTP and webhook secret configuration, connectivity, and worker logs.",
  );
  process.exitCode = 1;
});
