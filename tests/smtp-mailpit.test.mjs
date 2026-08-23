import assert from "node:assert/strict";
import test from "node:test";
import { createSmtpAdapter } from "../src/lib/smtp-adapter.ts";

const smtpUrl = process.env.PAPERBOY_TEST_SMTP_URL;
const mailpitUrl = process.env.PAPERBOY_TEST_MAILPIT_URL;

async function findCapturedMessage(messageId) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${mailpitUrl}/api/v1/messages`, {
      signal: AbortSignal.timeout(5_000),
    });
    assert.equal(response.ok, true);
    const list = await response.json();
    const captured = list.messages.find(
      (candidate) => candidate.MessageID === messageId,
    );

    if (captured) {
      return captured;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  return null;
}

test(
  "Compose Mailpit receives the message from the real SMTP adapter",
  {
    skip:
      smtpUrl && mailpitUrl
        ? false
        : "PAPERBOY_TEST_SMTP_URL and PAPERBOY_TEST_MAILPIT_URL are not configured",
  },
  async () => {
    const messageId = "18181818-1818-4818-8181-181818181818";
    const adapter = createSmtpAdapter({
      environment: {
        SMTP_TLS_MODE: "disabled",
        SMTP_URL: smtpUrl,
      },
      now: () => new Date("2026-08-23T04:05:06.000Z"),
    });

    try {
      await adapter.verify();
      await adapter.send({
        attemptCount: 1,
        attachments: [
          {
            content: Buffer.from("Mailpit attachment proof"),
            contentType: "text/plain",
            filename: "proof.txt",
          },
        ],
        deliveryMode: "live",
        environment: "live",
        from: "PaperBoy <news@example.com>",
        html: "<p>Mailpit Compose proof</p>",
        id: messageId,
        subject: "PaperBoy SMTP Compose proof",
        text: "Mailpit Compose proof",
        to: ["reader@example.net"],
      });

      const captured = await findCapturedMessage(`${messageId}@example.com`);

      assert.ok(captured);
      assert.equal(captured.Subject, "PaperBoy SMTP Compose proof");
      assert.deepEqual(captured.From, {
        Address: "news@example.com",
        Name: "PaperBoy",
      });
      assert.deepEqual(captured.To, [
        { Address: "reader@example.net", Name: "" },
      ]);

      const messageResponse = await fetch(
        `${mailpitUrl}/api/v1/message/${captured.ID}`,
        { signal: AbortSignal.timeout(5_000) },
      );
      assert.equal(messageResponse.ok, true);
      const message = await messageResponse.json();

      assert.equal(message.Date, "2026-08-23T04:05:06Z");
      assert.equal(message.Text, "Mailpit Compose proof");
      assert.equal(message.HTML, "<p>Mailpit Compose proof</p>");
      assert.equal(message.Attachments.length, 1);
      assert.equal(message.Attachments[0].FileName, "proof.txt");
      assert.equal(message.Attachments[0].ContentType, "text/plain");
    } finally {
      adapter.close();
    }
  },
);
