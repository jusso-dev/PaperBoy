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
    { paperBoyMcpDomainServices },
    { paperBoyMcpEmailServices },
  ] = await Promise.all([
    import("@/lib/api-key-auth"),
    import("@/lib/organization-reader"),
    import("@/mcp/domain-services"),
    import("@/mcp/email-services"),
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
        domains: paperBoyMcpDomainServices,
        emails: paperBoyMcpEmailServices,
        findOrganization: findOrganizationById,
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
