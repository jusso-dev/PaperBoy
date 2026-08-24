import assert from "node:assert/strict";
import test from "node:test";
import {
  AWS_SES_DAILY_UTILIZATION,
  AWS_SES_RATE_UTILIZATION,
  awsSesQuotaScopeHash,
  awsSesReservationKey,
  parseAwsSesQuotaSnapshot,
  safeAwsSesDailyRecipients,
  safeAwsSesRecipientsPerSecond,
} from "../src/lib/aws-ses-quota.ts";

const observedAt = new Date("2026-08-24T00:00:00.000Z");

test("SES quota snapshots are bounded and reserve operational headroom", () => {
  const snapshot = parseAwsSesQuotaSnapshot(
    {
      Max24HourSend: 50_000,
      MaxSendRate: 14,
      SentLast24Hours: 1_200,
    },
    observedAt,
  );
  assert.ok(snapshot);
  assert.equal(AWS_SES_RATE_UTILIZATION, 0.8);
  assert.equal(AWS_SES_DAILY_UTILIZATION, 0.9);
  assert.equal(safeAwsSesRecipientsPerSecond(snapshot), 11);
  assert.equal(safeAwsSesDailyRecipients(snapshot), 45_000);
  assert.equal(
    safeAwsSesRecipientsPerSecond({ ...snapshot, maxSendRate: 0.5 }),
    0.4,
  );
  assert.equal(
    safeAwsSesDailyRecipients({ ...snapshot, max24HourSend: 1 }),
    0,
  );
  assert.equal(
    parseAwsSesQuotaSnapshot(
      { Max24HourSend: 1, MaxSendRate: 0, SentLast24Hours: 0 },
      observedAt,
    ),
    null,
  );
});

test("SES quota scope and attempt reservations are deterministic hashes", () => {
  const configuration = {
    configurationSetName: null,
    credentials: { kind: "default-chain" },
    region: "ap-southeast-2",
    scope: "operator-default",
    snsTopicArn: null,
  };
  const delivery = {
    attemptCount: 2,
    attachments: [],
    deliveryMode: "live",
    environment: "live",
    from: "paperboy@yumait.au",
    html: null,
    id: "11111111-1111-4111-8111-111111111111",
    orgId: "22222222-2222-4222-8222-222222222222",
    provider: "aws-ses",
    subject: "Quota",
    text: "Quota",
    to: ["reader@example.net"],
  };
  assert.match(awsSesQuotaScopeHash(configuration), /^[0-9a-f]{64}$/);
  assert.equal(
    awsSesQuotaScopeHash(configuration),
    awsSesQuotaScopeHash(configuration),
  );
  assert.match(awsSesReservationKey([delivery]), /^[0-9a-f]{64}$/);
  assert.notEqual(
    awsSesReservationKey([delivery]),
    awsSesReservationKey([{ ...delivery, attemptCount: 3 }]),
  );
});
