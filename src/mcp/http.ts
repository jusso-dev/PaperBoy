import "server-only";

import {
  createMcpHandler,
  type AuthInfo,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { isApiKeyEnvironment } from "@/lib/api-key-crypto";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { findOrganizationById } from "@/lib/organization-reader";
import { paperBoyMcpBroadcastServices } from "@/mcp/broadcast-services";
import { paperBoyMcpDomainServices } from "@/mcp/domain-services";
import { paperBoyMcpDeliveryServices } from "@/mcp/delivery-services";
import { paperBoyMcpEmailServices } from "@/mcp/email-services";
import { paperBoyMcpTemplateServices } from "@/mcp/template-services";
import { paperBoyMcpWebhookServices } from "@/mcp/webhook-services";
import { createPaperBoyMcpServer } from "@/mcp/server";

const principalKey = "paperboyPrincipal";

function principalFromRequestContext(
  context: McpRequestContext,
): ApiKeyPrincipal | null {
  const value = context.authInfo?.extra?.[principalKey];

  if (!value || typeof value !== "object") {
    return null;
  }

  const principal = value as Partial<ApiKeyPrincipal>;

  if (
    (principal.actorUserId !== null &&
      typeof principal.actorUserId !== "string") ||
    typeof principal.apiKeyId !== "string" ||
    typeof principal.orgId !== "string" ||
    !isApiKeyEnvironment(principal.environment)
  ) {
    return null;
  }

  return {
    actorUserId: principal.actorUserId,
    apiKeyId: principal.apiKeyId,
    environment: principal.environment,
    orgId: principal.orgId,
  };
}

export function mcpAuthInfo(principal: ApiKeyPrincipal): AuthInfo {
  return {
    clientId: principal.apiKeyId,
    extra: { [principalKey]: principal },
    scopes: ["mcp", `organization:${principal.orgId}`],
    token: `verified:${principal.apiKeyId}`,
  };
}

export const paperBoyMcpHttpHandler = createMcpHandler(
  (context) =>
    createPaperBoyMcpServer({
      authorize: async () => principalFromRequestContext(context),
      broadcasts: paperBoyMcpBroadcastServices,
      deliveries: paperBoyMcpDeliveryServices,
      domains: paperBoyMcpDomainServices,
      emails: paperBoyMcpEmailServices,
      findOrganization: findOrganizationById,
      templates: paperBoyMcpTemplateServices,
      webhooks: paperBoyMcpWebhookServices,
    }),
  {
    onerror: () =>
      console.error("PaperBoy MCP encountered a protocol error."),
  },
);
