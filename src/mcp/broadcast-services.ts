import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { broadcastApiServices } from "@/lib/broadcast-api-services";
import type { PaperBoyMcpBroadcastServices } from "@/mcp/broadcast-tools";

function servicePayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const input = payload as Record<string, unknown>;
  const mapped: Record<string, unknown> = {
    ...input,
    template_id: input.templateId,
  };
  delete mapped.templateId;
  return mapped;
}

export const paperBoyMcpBroadcastServices: PaperBoyMcpBroadcastServices = {
  cancel: broadcastApiServices.cancel,
  create: (principal: ApiKeyPrincipal, payload: unknown) =>
    broadcastApiServices.create(principal, servicePayload(payload)),
  get: broadcastApiServices.get,
  list: broadcastApiServices.list,
  pause: broadcastApiServices.pause,
  resume: broadcastApiServices.resume,
};
