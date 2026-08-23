import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { config } from "dotenv";
import { createPaperBoyMcpServer } from "@/mcp/server";

config({ quiet: true });

async function main() {
  const rawApiKey = process.env.PAPERBOY_API_KEY;

  if (!rawApiKey) {
    console.error("PaperBoy MCP requires PAPERBOY_API_KEY.");
    process.exitCode = 1;
    return;
  }

  const [
    { authenticateApiKey },
    { findOrganizationById },
    { paperBoyMcpAudienceServices },
    { paperBoyMcpBroadcastServices },
    { paperBoyMcpDomainServices },
    { paperBoyMcpDeliveryServices },
    { paperBoyMcpEmailServices },
    { paperBoyMcpFeedbackServices },
    { paperBoyMcpOpenTrackingServices },
    { paperBoyMcpRateLimitServices },
    { paperBoyMcpSuppressionServices },
    { paperBoyMcpTemplateServices },
    { paperBoyMcpWebhookServices },
  ] = await Promise.all([
    import("@/lib/api-key-auth"),
    import("@/lib/organization-reader"),
    import("@/mcp/audience-services"),
    import("@/mcp/broadcast-services"),
    import("@/mcp/domain-services"),
    import("@/mcp/delivery-services"),
    import("@/mcp/email-services"),
    import("@/mcp/feedback-services"),
    import("@/mcp/open-tracking-services"),
    import("@/mcp/rate-limit-services"),
    import("@/mcp/suppression-services"),
    import("@/mcp/template-services"),
    import("@/mcp/webhook-services"),
  ]);
  const principal = await authenticateApiKey(rawApiKey);

  if (!principal) {
    console.error("PaperBoy MCP could not authenticate the API key.");
    process.exitCode = 1;
    return;
  }

  serveStdio(
    () =>
      createPaperBoyMcpServer({
        authorize: () => authenticateApiKey(rawApiKey),
        audiences: paperBoyMcpAudienceServices,
        broadcasts: paperBoyMcpBroadcastServices,
        deliveries: paperBoyMcpDeliveryServices,
        domains: paperBoyMcpDomainServices,
        emails: paperBoyMcpEmailServices,
        feedback: paperBoyMcpFeedbackServices,
        findOrganization: findOrganizationById,
        openTracking: paperBoyMcpOpenTrackingServices,
        rateLimits: paperBoyMcpRateLimitServices,
        suppressions: paperBoyMcpSuppressionServices,
        templates: paperBoyMcpTemplateServices,
        webhooks: paperBoyMcpWebhookServices,
      }),
    {
      onerror: () =>
        console.error("PaperBoy MCP encountered a protocol error."),
    },
  );

  console.error("PaperBoy MCP ready on stdio.");
}

void main().catch(() => {
  console.error(
    "PaperBoy MCP failed to start. Check DATABASE_URL, migrations, and PAPERBOY_API_KEY.",
  );
  process.exitCode = 1;
});
