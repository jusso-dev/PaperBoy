import assert from "node:assert/strict";
import test from "node:test";

test("the stdio service graph loads outside the Next.js compiler", async () => {
  process.env.DATABASE_URL ??= "postgres://paperboy@127.0.0.1:5433/paperboy";

  const [
    apiKeyAuth,
    organizations,
    audiences,
    broadcasts,
    deliveries,
    domains,
    emails,
    outboundProviders,
    templates,
  ] = await Promise.all([
    import("../src/lib/api-key-auth.ts"),
    import("../src/lib/organization-reader.ts"),
    import("../src/mcp/audience-services.ts"),
    import("../src/mcp/broadcast-services.ts"),
    import("../src/mcp/delivery-services.ts"),
    import("../src/mcp/domain-services.ts"),
    import("../src/mcp/email-services.ts"),
    import("../src/mcp/outbound-provider-services.ts"),
    import("../src/mcp/template-services.ts"),
  ]);

  assert.equal(typeof apiKeyAuth.authenticateApiKey, "function");
  assert.equal(typeof organizations.findOrganizationById, "function");
  assert.equal(typeof audiences.paperBoyMcpAudienceServices.listAudiences, "function");
  assert.equal(typeof broadcasts.paperBoyMcpBroadcastServices.list, "function");
  assert.equal(typeof deliveries.paperBoyMcpDeliveryServices.list, "function");
  assert.equal(typeof domains.paperBoyMcpDomainServices.list, "function");
  assert.equal(typeof emails.paperBoyMcpEmailServices.queue, "function");
  assert.equal(typeof outboundProviders.paperBoyMcpOutboundProviderServices.get, "function");
  assert.equal(typeof templates.paperBoyMcpTemplateServices.list, "function");
});
