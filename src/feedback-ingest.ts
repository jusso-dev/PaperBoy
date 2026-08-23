import { readFile, stat } from "node:fs/promises";
import { config } from "dotenv";
import { MAX_FEEDBACK_REPORT_BYTES } from "@/lib/feedback-core";
import { protocolTimestamp } from "@/lib/time";

config({ quiet: true });

async function feedbackApiKey(): Promise<string> {
  const direct = process.env.PAPERBOY_FEEDBACK_API_KEY;
  const path = process.env.PAPERBOY_FEEDBACK_API_KEY_FILE;

  if ((direct && path) || (!direct && !path)) {
    throw new Error(
      "Set exactly one of PAPERBOY_FEEDBACK_API_KEY or PAPERBOY_FEEDBACK_API_KEY_FILE.",
    );
  }

  if (path) {
    const keyFile = await stat(path);

    if (!keyFile.isFile() || keyFile.size > 4_096) {
      throw new Error("PaperBoy feedback API key file is invalid.");
    }
  }

  const value = direct ?? (await readFile(path as string, "utf8")).trim();

  if (!value || /[\r\n]/.test(value)) {
    throw new Error("PaperBoy feedback API key is invalid.");
  }

  return value;
}

async function readReport(): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of process.stdin) {
    const content = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += content.length;

    if (size > MAX_FEEDBACK_REPORT_BYTES) {
      throw new Error("Feedback report exceeds 10 MiB.");
    }

    chunks.push(content);
  }

  if (size === 0) {
    throw new Error("Feedback report stdin is empty.");
  }

  return Buffer.concat(chunks);
}

async function main() {
  const rawApiKey = await feedbackApiKey();
  const raw = await readReport();
  const [{ db }, { authenticateApiKey }, { ingestFeedbackReport }] =
    await Promise.all([
      import("@/db"),
      import("@/lib/api-key-auth"),
      import("@/lib/feedback"),
    ]);

  try {
    const principal = await authenticateApiKey(rawApiKey);

    if (!principal) {
      throw new Error("PaperBoy feedback API key could not authenticate.");
    }

    const results = await ingestFeedbackReport({
      actorUserId: principal.actorUserId,
      orgId: principal.orgId,
      raw,
    });
    process.stdout.write(
      `${JSON.stringify({
        data: results.map((result) => ({
          classification: result.classification,
          event_id: result.eventId,
          ingested_at: protocolTimestamp(result.createdAt),
          message_id: result.messageId,
          replayed: result.replayed,
          suppressed: result.suppressed,
        })),
        protocol_time_zone: "UTC",
      })}\n`,
    );
  } finally {
    await db.$client.end();
  }
}

void main().catch(() => {
  console.error(
    "PaperBoy could not ingest feedback. Check the API key, report format, tenant correlation, database, and migrations.",
  );
  process.exitCode = 1;
});
