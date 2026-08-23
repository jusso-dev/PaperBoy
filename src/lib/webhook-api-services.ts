import type { WebhookHttpServices } from "@/lib/webhook-http";
import {
  configureWebhookEndpoint,
  getWebhookEndpoint,
} from "@/lib/webhooks";

export const webhookApiServices: WebhookHttpServices = {
  configure: (principal, payload) =>
    configureWebhookEndpoint({
      actorUserId: principal.actorUserId,
      orgId: principal.orgId,
      payload,
    }),
  get: (principal) =>
    getWebhookEndpoint({
      actorUserId: principal.actorUserId,
      orgId: principal.orgId,
    }),
};
