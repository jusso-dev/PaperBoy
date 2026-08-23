import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  GetAccountCommand,
  SendBulkEmailCommand,
  SendEmailCommand,
} from "@aws-sdk/client-sesv2";
import {
  AWS_SES_MESSAGE_ID_TAG,
  createAwsSesAdapter,
  mapAwsSesEvent,
} from "../src/lib/aws-ses-adapter.ts";

const messageId = "11111111-1111-4111-8111-111111111111";
const orgId = "22222222-2222-4222-8222-222222222222";
const receivedAt = new Date("2026-08-24T01:06:00.000Z");
const configuration = {
  configurationSetName: "paperboy-events",
  credentials: {
    credentials: {
      accessKeyId: "TESTSESACCESSKEY01",
      secretAccessKey: "fixture-secret-access-key",
    },
    kind: "access-key",
  },
  region: "us-east-1",
  scope: "organization",
  snsTopicArn:
    "arn:aws:sns:us-east-1:123456789012:paperboy-ses-events",
};

async function fixture(name) {
  return JSON.parse(
    await readFile(
      new URL(`fixtures/providers/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}

function message(overrides = {}) {
  return {
    attemptCount: 1,
    attachments: [
      {
        content: Buffer.from("fixture attachment"),
        contentType: "text/plain",
        filename: "fixture.txt",
      },
    ],
    deliveryMode: "live",
    environment: "live",
    from: "PaperBoy <news@example.com>",
    html: "<p>SES fixture</p>",
    id: messageId,
    orgId,
    provider: "aws-ses",
    subject: "Amazon SES fixture",
    text: "SES fixture",
    to: ["reader@example.net"],
    ...overrides,
  };
}

test("SES v2 SendEmail submits lossless raw MIME and stores the provider ID", async () => {
  const commands = [];
  const sendResponse = await fixture("aws-ses-send");
  const adapter = createAwsSesAdapter({
    client: {
      async send(command) {
        commands.push(command);
        return sendResponse;
      },
    },
    configuration,
    now: () => new Date("2026-08-24T01:00:00.000Z"),
  });

  const result = await adapter.send(message());
  assert.deepEqual(result, { providerMessageId: sendResponse.MessageId });
  assert.equal(commands.length, 1);
  assert.ok(commands[0] instanceof SendEmailCommand);
  const input = commands[0].input;
  assert.equal(input.ConfigurationSetName, "paperboy-events");
  assert.equal(input.FromEmailAddress, "PaperBoy <news@example.com>");
  assert.deepEqual(input.Destination.ToAddresses, ["reader@example.net"]);
  assert.deepEqual(input.EmailTags, [
    { Name: AWS_SES_MESSAGE_ID_TAG, Value: messageId },
  ]);
  const raw = Buffer.from(input.Content.Raw.Data).toString("utf8");
  assert.match(
    raw,
    /X-PaperBoy-Message-ID: 11111111-1111-4111-8111-111111111111/i,
  );
  assert.match(raw, /filename=fixture\.txt/);
  assert.match(raw, /Amazon SES fixture/);
});

test("SES v2 SendBulkEmail preserves input order and per-message tags", async () => {
  const commands = [];
  const bulkResponse = await fixture("aws-ses-bulk-send");
  const adapter = createAwsSesAdapter({
    client: {
      async send(command) {
        commands.push(command);
        return bulkResponse;
      },
    },
    configuration,
  });
  const secondId = "33333333-3333-4333-8333-333333333333";
  const results = await adapter.sendBatch([
    message(),
    message({
      id: secondId,
      subject: "Second subject with {{literal braces}}",
      text: "Second recipient body",
      to: ["second@example.net"],
    }),
  ]);

  assert.deepEqual(
    results.map((result) => result.providerMessageId),
    ["010001-ses-bulk-001", "010001-ses-bulk-002"],
  );
  assert.ok(commands[0] instanceof SendBulkEmailCommand);
  const input = commands[0].input;
  assert.equal(input.BulkEmailEntries.length, 2);
  assert.deepEqual(input.BulkEmailEntries[1].ReplacementTags, [
    { Name: AWS_SES_MESSAGE_ID_TAG, Value: secondId },
  ]);
  assert.deepEqual(input.BulkEmailEntries[1].Destination.ToAddresses, [
    "second@example.net",
  ]);
  const replacements = JSON.parse(
    input.BulkEmailEntries[1].ReplacementEmailContent.ReplacementTemplate
      .ReplacementTemplateData,
  );
  assert.equal(replacements.pb_subject, "Second subject with {{literal braces}}");
  assert.equal(input.DefaultContent.Template.Attachments[0].FileName, "fixture.txt");
});

test("SES connection tests surface regional sandbox state without credentials", async () => {
  const commands = [];
  const adapter = createAwsSesAdapter({
    client: {
      async send(command) {
        commands.push(command);
        return {
          ProductionAccessEnabled: false,
          SendingEnabled: true,
        };
      },
    },
    configuration,
  });
  assert.deepEqual(await adapter.testConnection(), {
    accountMode: "sandbox",
    region: "us-east-1",
    sendingEnabled: true,
  });
  assert.ok(commands[0] instanceof GetAccountCommand);
  assert.equal(JSON.stringify(await adapter.testConnection()).includes("secret"), false);
});

test("recorded SNS and EventBridge fixtures map to stable events and safe suppressions", async () => {
  const bounce = mapAwsSesEvent({
    payload: await fixture("aws-ses-sns-bounce"),
    receivedAt,
  });
  const complaint = mapAwsSesEvent({
    payload: await fixture("aws-ses-sns-complaint"),
    receivedAt,
  });
  const delivery = mapAwsSesEvent({
    payload: await fixture("aws-ses-sns-delivery"),
    receivedAt,
  });
  const delay = mapAwsSesEvent({
    payload: await fixture("aws-ses-eventbridge-delay"),
    receivedAt,
  });

  assert.equal(bounce[0].type, "bounced");
  assert.equal(bounce[0].messageId, messageId);
  assert.equal(bounce[0].providerMessageId, "010001-ses-message-fixture");
  assert.deepEqual(bounce[0].suppressions, [
    { email: "reader@example.net", reason: "bounced" },
  ]);
  assert.deepEqual(complaint[0].suppressions, [
    { email: "reader@example.net", reason: "complained" },
  ]);
  assert.equal(delivery[0].type, "delivered");
  assert.equal(delay[0].type, "deferred");
  assert.equal(delay[0].data.delay_type, "MailboxFull");
  assert.equal(JSON.stringify(bounce[0].data).includes("reader@example.net"), false);
  assert.equal(JSON.stringify(bounce[0].data).includes("smtp"), false);
});
