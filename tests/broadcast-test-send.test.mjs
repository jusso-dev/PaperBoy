import assert from "node:assert/strict";
import test from "node:test";
import { queueBroadcastTestEmail } from "../src/lib/broadcast-test-send.ts";

const broadcastId = "99999999-9999-4999-8999-999999999999";
const orgId = "11111111-1111-4111-8111-111111111111";
const recipient = "justin@example.net";

const broadcast = {
  cancelledAt: null,
  completedAt: null,
  createdAt: new Date("2026-08-24T05:06:07.000Z"),
  environment: "live",
  from: "Newsroom <news@paperboy.test>",
  id: broadcastId,
  name: "Morning edition",
  pausedAt: null,
  progress: {
    cancelled: 0,
    failed: 0,
    pending: 1,
    processing: 0,
    queued: 0,
    suppressed: 0,
    total: 1,
  },
  scheduledFor: new Date("2026-09-01T00:00:00.000Z"),
  sourceAudienceId: "77777777-7777-4777-8777-777777777777",
  sourceTemplateId: "88888888-8888-4888-8888-888888888888",
  status: "scheduled",
  templateHtml: "<p>Hello {{name}}</p>",
  templateName: "Welcome reader",
  templateRequiredVariables: [],
  templateSubject: "Edition for {{name}}",
  templateText: "Hello {{name}}",
  updatedAt: new Date("2026-08-24T05:06:07.000Z"),
};

test("broadcast test send uses the broadcast from-address and rendered body", async () => {
  const queued = [];
  const result = await queueBroadcastTestEmail(
    {
      actorUserId: "user-one",
      broadcastId,
      orgId,
      to: recipient,
    },
    {
      authorize: async () => undefined,
      loadBroadcast: async () => broadcast,
      queue: async (input) => {
        queued.push(input);
        return {
          createdAt: new Date("2026-08-24T05:06:07.000Z"),
          deliveryMode: "live",
          domainId: null,
          environment: "live",
          id: "msg-test-1",
          provider: "smtp",
          replayed: false,
          status: "queued",
        };
      },
    },
  );

  assert.equal(result.id, "msg-test-1");
  assert.equal(queued.length, 1);
  assert.equal(queued[0].payload.from, broadcast.from);
  assert.equal(queued[0].payload.to, recipient);
  assert.equal(queued[0].payload.subject, `Edition for ${recipient}`);
  assert.equal(queued[0].payload.html, `<p>Hello ${recipient}</p>`);
  assert.equal(queued[0].payload.text, `Hello ${recipient}`);
  assert.doesNotMatch(queued[0].payload.from, /PaperBoy <test@/);
  assert.doesNotMatch(queued[0].payload.html, /PaperBoy test email/);
  assert.equal(queued[0].principal.environment, "live");
});

test("broadcast test send keeps an edited from-address instead of test@domain", async () => {
  const queued = [];
  await queueBroadcastTestEmail(
    {
      actorUserId: "user-one",
      broadcastId,
      from: "Desk <desk@paperboy.test>",
      html: "<p>Updated {{name}}</p>",
      orgId,
      subject: "Proof for {{name}}",
      to: recipient,
    },
    {
      authorize: async () => undefined,
      loadBroadcast: async () => broadcast,
      queue: async (input) => {
        queued.push(input);
        return {
          createdAt: new Date("2026-08-24T05:06:07.000Z"),
          deliveryMode: "live",
          domainId: null,
          environment: "live",
          id: "msg-test-2",
          provider: "smtp",
          replayed: false,
          status: "queued",
        };
      },
    },
  );

  assert.equal(queued[0].payload.from, "Desk <desk@paperboy.test>");
  assert.equal(queued[0].payload.html, `<p>Updated ${recipient}</p>`);
  assert.equal(queued[0].payload.subject, `Proof for ${recipient}`);
  assert.doesNotMatch(queued[0].payload.from, /test@paperboy\.test/);
});
