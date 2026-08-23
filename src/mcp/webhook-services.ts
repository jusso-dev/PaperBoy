import type { PaperBoyMcpWebhookServices } from "@/mcp/webhook-tools";
import {
  configureWebhookEndpoint,
  getWebhookEndpoint,
} from "@/lib/webhooks";

export const paperBoyMcpWebhookServices: PaperBoyMcpWebhookServices = {
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
