import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { queueEmail } from "@/lib/messages";
import type { PaperBoyMcpEmailServices } from "@/mcp/email-tools";

export const paperBoyMcpEmailServices: PaperBoyMcpEmailServices = {
  queue: (
    principal: ApiKeyPrincipal,
    payload: unknown,
    idempotencyKey?: unknown,
  ) => queueEmail({ idempotencyKey, payload, principal }),
};
