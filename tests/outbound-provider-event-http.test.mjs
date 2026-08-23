import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  handleIngestOutboundProviderEventRequest,
} from "../src/lib/outbound-provider-event-http.ts";
import { handleAwsSesSnsRequest } from "../src/lib/outbound-provider-sns-http.ts";
import { organizationAwsSesVariable } from "../src/lib/outbound-provider-configuration.ts";

const orgId = "11111111-1111-4111-8111-111111111111";
const messageId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const fixedNow = new Date("2026-08-24T01:06:00.000Z");
const principal = {
  actorUserId: "user-one",
  apiKeyId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  environment: "live",
  orgId,
};

async function fixture(name) {
  return JSON.parse(
    await readFile(
      new URL(`fixtures/providers/${name}.json`, import.meta.url),
      "utf8",
    ),
  );
}

test("authenticated SES event REST ingestion is tenant-bound and UTC", async () => {
  const calls = [];
  const payload = await fixture("aws-ses-sns-bounce");
  const response = await handleIngestOutboundProviderEventRequest(
    new Request("https://paperboy.test/api/v1/providers/aws-ses/events", {
      body: JSON.stringify(payload),
      headers: {
        Authorization: "Bearer test",
        "Content-Type": "application/json",
      },
      method: "POST",
    }),
    "aws-ses",
    {
      authenticate: async () => principal,
      async ingest(receivedPrincipal, provider, receivedPayload) {
        calls.push([receivedPrincipal, provider, receivedPayload]);
        return [
          {
            createdAt: fixedNow,
            eventId,
            messageId,
            provider,
            providerEventId: payload.MessageId,
            replayed: false,
            suppressionCount: 1,
            type: "bounced",
          },
        ];
      },
    },
  );

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    data: [
      {
        created_at: fixedNow.toISOString(),
        event_id: eventId,
        message_id: messageId,
        provider: "aws-ses",
        provider_event_id: payload.MessageId,
        replayed: false,
        suppression_count: 1,
        type: "bounced",
      },
    ],
    protocol_time_zone: "UTC",
  });
  assert.deepEqual(calls, [[principal, "aws-ses", payload]]);
});

test("authenticated SES event REST ingestion rejects missing auth and oversized payloads", async () => {
  const dependencies = {
    authenticate: async (request) =>
      request.headers.has("authorization") ? principal : null,
    ingest: async () => [],
  };
  const unauthorized = await handleIngestOutboundProviderEventRequest(
    new Request("https://paperboy.test/api/v1/providers/aws-ses/events", {
      method: "POST",
    }),
    "aws-ses",
    dependencies,
  );
  const oversized = await handleIngestOutboundProviderEventRequest(
    new Request("https://paperboy.test/api/v1/providers/aws-ses/events", {
      body: "{}",
      headers: {
        Authorization: "Bearer test",
        "Content-Length": String(512 * 1024 + 1),
      },
      method: "POST",
    }),
    "aws-ses",
    dependencies,
  );
  assert.equal(unauthorized.status, 401);
  assert.equal(oversized.status, 413);
});

test("the public per-org SNS endpoint verifies the configured topic before ingestion", async () => {
  const topicArn =
    "arn:aws:sns:us-east-1:123456789012:paperboy-ses-events";
  const payload = await fixture("aws-ses-sns-bounce");
  const calls = [];
  const response = await handleAwsSesSnsRequest(
    new Request(
      `https://paperboy.test/api/v1/providers/aws-ses/events/${orgId}`,
      { body: JSON.stringify(payload), method: "POST" },
    ),
    orgId,
    {
      environment: {
        [organizationAwsSesVariable(orgId, "REGION")]: "us-east-1",
        [organizationAwsSesVariable(orgId, "ROLE_ARN")]:
          "arn:aws:iam::123456789012:role/paperboy-ses",
        [organizationAwsSesVariable(orgId, "SNS_TOPIC_ARN")]: topicArn,
      },
      async ingest(input) {
        calls.push(["ingest", input]);
        return [];
      },
      async verify(input) {
        calls.push(["verify", input.expectedTopicArn]);
        return { ...payload, Type: "Notification" };
      },
    },
  );

  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(calls[0][1], topicArn);
  assert.equal(calls[1][1].orgId, orgId);
  assert.equal(calls[1][1].provider, "aws-ses");
  assert.deepEqual(calls[1][1].payload, payload);
});
