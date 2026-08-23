import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  defineOutboundProviderAdapter,
  LIVE_OUTBOUND_PROVIDERS,
  OUTBOUND_PROVIDER_CATALOG,
  OutboundProviderContractError,
} from "../src/lib/outbound-provider-core.ts";
import { routeOutboundProviders } from "../src/lib/worker-core.ts";
import { webhookEventBody } from "../src/lib/webhook-core.ts";

const messageId = "11111111-1111-4111-8111-111111111111";
const receivedAt = new Date("2026-08-24T00:00:00.000Z");

async function fixture(provider) {
  return JSON.parse(
    await readFile(
      new URL(`fixtures/providers/${provider}.json`, import.meta.url),
      "utf8",
    ),
  );
}

function message(provider) {
  return {
    attemptCount: 1,
    attachments: [],
    deliveryMode: "live",
    environment: "live",
    from: "news@example.com",
    html: "<p>Provider-neutral</p>",
    id: messageId,
    orgId: "22222222-2222-4222-8222-222222222222",
    provider,
    subject: "Provider contract",
    text: "Provider-neutral",
    to: ["reader@example.net"],
  };
}

function fakeAdapter(record, calls) {
  const capabilities = OUTBOUND_PROVIDER_CATALOG[record.provider].capabilities;
  return defineOutboundProviderAdapter({
    capabilities,
    async mapEvent({ payload, receivedAt: occurredAt }) {
      return [
        {
          data: {},
          messageId: payload.message_id,
          occurredAt,
          type: payload.event,
        },
      ];
    },
    provider: record.provider,
    async send(delivery) {
      calls.push([record.provider, delivery.id]);
      return { providerMessageId: record.provider_message_id };
    },
    ...(capabilities.batch
      ? {
          async sendBatch(deliveries) {
            return deliveries.map(() => ({
              providerMessageId: record.provider_message_id,
            }));
          },
        }
      : {}),
    async testConnection() {},
  });
}

test("the provider contract routes one semantic message through every identity", async () => {
  const records = await Promise.all(LIVE_OUTBOUND_PROVIDERS.map(fixture));
  const calls = [];
  const adapters = Object.fromEntries(
    records.map((record) => [record.provider, fakeAdapter(record, calls)]),
  );
  const router = routeOutboundProviders(adapters);

  for (const record of records) {
    const result = await router.send(message(record.provider));
    assert.equal(result.providerMessageId, record.provider_message_id);
    const [event] = await adapters[record.provider].mapEvent({
      payload: { event: record.event, message_id: messageId },
      receivedAt,
    });
    assert.equal(event.messageId, messageId);
    assert.equal(
      JSON.parse(
        webhookEventBody({
          createdAt: event.occurredAt,
          environment: "live",
          messageId: event.messageId,
          type: event.type,
        }),
      ).type,
      "email.delivered",
    );
  }

  assert.deepEqual(
    calls,
    LIVE_OUTBOUND_PROVIDERS.map((provider) => [provider, messageId]),
  );
});

test("capability declarations fail closed when adapter methods disagree", () => {
  assert.throws(
    () =>
      defineOutboundProviderAdapter({
        capabilities: { batch: true, events: true, scheduling: false },
        async mapEvent() {
          return [];
        },
        provider: "aws-ses",
        async send() {
          return { providerMessageId: null };
        },
        async testConnection() {},
      }),
    OutboundProviderContractError,
  );
});
