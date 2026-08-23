import "server-only";

import {
  createMcpHandler,
  type AuthInfo,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import { isApiKeyEnvironment } from "@/lib/api-key-crypto";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import { findOrganizationById } from "@/lib/organization-reader";
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
    typeof principal.apiKeyId !== "string" ||
    typeof principal.orgId !== "string" ||
    !isApiKeyEnvironment(principal.environment)
  ) {
    return null;
  }

  return {
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
      findOrganization: findOrganizationById,
    }),
  {
    onerror: () =>
      console.error("PaperBoy MCP encountered a protocol error."),
  },
);
