import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { AuthorizationError } from "@/lib/authorization";
import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  DNS_CHECK_STATUSES,
  DOMAIN_STATUSES,
  DomainError,
  type DomainDnsRecord,
} from "@/lib/domain-core";
import {
  DKIM_KEY_STATUSES,
  DkimError,
  dkimDnsName,
  dkimDnsValue,
} from "@/lib/dkim-core";
import type { SendingDomainRecord } from "@/lib/domains";
import { protocolTimestamp } from "@/lib/time";
import { PAPERBOY_MCP_SCHEMA_VERSION } from "@/mcp/contract";

export const PAPERBOY_DOMAIN_MCP_TOOL_NAMES = [
  "paperboy_list_domains",
  "paperboy_create_domain",
  "paperboy_verify_domain",
  "paperboy_delete_domain",
  "paperboy_setup_domain_dkim",
  "paperboy_rotate_domain_dkim",
  "paperboy_finalize_domain_dkim_rotation",
] as const;

export const PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS = [
  {
    description:
      "List sending domains and their publishable DNS records for the authenticated organization.",
    mutating: false,
    name: PAPERBOY_DOMAIN_MCP_TOOL_NAMES[0],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Add a sending domain to the authenticated organization and return its DNS records.",
    mutating: true,
    name: PAPERBOY_DOMAIN_MCP_TOOL_NAMES[1],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Resolve a domain's required TXT records from the PaperBoy host and update verification state.",
    mutating: true,
    name: PAPERBOY_DOMAIN_MCP_TOOL_NAMES[2],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Permanently delete a sending-domain configuration from the authenticated organization.",
    mutating: true,
    name: PAPERBOY_DOMAIN_MCP_TOOL_NAMES[3],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Idempotently generate an encrypted PaperBoy DKIM key for a legacy domain that has none.",
    mutating: true,
    name: PAPERBOY_DOMAIN_MCP_TOOL_NAMES[4],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Stage a new DKIM selector while PaperBoy continues signing with the current active selector.",
    mutating: true,
    name: PAPERBOY_DOMAIN_MCP_TOOL_NAMES[5],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
  {
    description:
      "Destroy the retiring DKIM private key after the replacement selector is active.",
    mutating: true,
    name: PAPERBOY_DOMAIN_MCP_TOOL_NAMES[6],
    schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
  },
] as const;

export type PaperBoyMcpDomainServices = {
  create: (
    principal: ApiKeyPrincipal,
    name: string,
  ) => Promise<SendingDomainRecord>;
  delete: (
    principal: ApiKeyPrincipal,
    domainId: string,
  ) => Promise<void>;
  finalizeDkimRotation: (
    principal: ApiKeyPrincipal,
    domainId: string,
  ) => Promise<SendingDomainRecord>;
  list: (principal: ApiKeyPrincipal) => Promise<SendingDomainRecord[]>;
  records: (domain: SendingDomainRecord) => DomainDnsRecord[];
  rotateDkim: (
    principal: ApiKeyPrincipal,
    domainId: string,
  ) => Promise<SendingDomainRecord>;
  setupDkim: (
    principal: ApiKeyPrincipal,
    domainId: string,
  ) => Promise<SendingDomainRecord>;
  verify: (
    principal: ApiKeyPrincipal,
    domainId: string,
  ) => Promise<SendingDomainRecord>;
};

const dnsChecksSchema = z.object({
  dkim: z.enum(DNS_CHECK_STATUSES),
  dmarc: z.enum(DNS_CHECK_STATUSES),
  ownership: z.enum(DNS_CHECK_STATUSES),
  spf: z.enum(DNS_CHECK_STATUSES),
});

const dnsRecordSchema = z.object({
  description: z.string(),
  key: z.enum(["ownership", "spf", "dkim", "dmarc"]),
  lifecycle: z.enum(DKIM_KEY_STATUSES).optional(),
  name: z.string(),
  required: z.boolean(),
  selector: z.string().optional(),
  status: z.enum(DNS_CHECK_STATUSES).optional(),
  type: z.literal("TXT"),
  value: z.string().nullable(),
});

const dkimKeySchema = z.object({
  activatedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  dnsName: z.string(),
  dnsStatus: z.enum(DNS_CHECK_STATUSES),
  dnsValue: z.string(),
  id: z.string().uuid(),
  lastCheckedAt: z.iso.datetime({ offset: true }).nullable(),
  retiredAt: z.iso.datetime({ offset: true }).nullable(),
  selector: z.string(),
  status: z.enum(DKIM_KEY_STATUSES),
  updatedAt: z.iso.datetime({ offset: true }),
});

const domainOutputSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  dkimKeys: z.array(dkimKeySchema),
  dnsChecks: dnsChecksSchema,
  dnsRecords: z.array(dnsRecordSchema),
  id: z.string().uuid(),
  lastCheckedAt: z.iso.datetime({ offset: true }).nullable(),
  name: z.string(),
  status: z.enum(DOMAIN_STATUSES),
  updatedAt: z.iso.datetime({ offset: true }),
  verifiedAt: z.iso.datetime({ offset: true }).nullable(),
});

const responseMetadataSchema = {
  observedAt: z.iso.datetime({ offset: true }),
  protocolTimeZone: z.literal("UTC"),
  schemaVersion: z.literal(PAPERBOY_MCP_SCHEMA_VERSION),
};

function domainErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "The API key creator's current role does not allow this domain operation.";
  }

  if (error instanceof DomainError) {
    switch (error.code) {
      case "INVALID_DOMAIN":
        return "Enter a hostname such as mail.example.com, without a URL or wildcard.";
      case "DOMAIN_EXISTS":
        return "That domain already exists in this organization.";
      case "DNS_CONFIGURATION_INVALID":
        return "The PaperBoy operator must correct PAPERBOY_SPF_RECORD.";
      case "MEMBERSHIP_REQUIRED":
        return "This API key is not attached to a current organization member. Create a new key from an owner or admin account.";
      default:
        return "That domain operation is not available.";
    }
  }

  if (error instanceof DkimError) {
    switch (error.code) {
      case "CONFIGURATION_INVALID":
        return "The PaperBoy operator must set a valid PAPERBOY_DKIM_ENCRYPTION_KEY.";
      case "KEY_NOT_ACTIVE":
        return "Verify the current DKIM selector before rotating it.";
      case "ROTATION_PENDING":
        return "Finish the current DKIM rotation before starting another.";
      case "ROTATION_NOT_READY":
        return "Publish and verify the replacement selector before finalising rotation.";
      default:
        return "That DKIM operation is not available.";
    }
  }

  return "The domain operation failed.";
}

function errorResult(error: unknown) {
  if (
    !(error instanceof DomainError) &&
    !(error instanceof DkimError) &&
    !(error instanceof AuthorizationError)
  ) {
    console.error("PaperBoy MCP domain operation failed.");
  }

  return {
    content: [
      { text: domainErrorMessage(error), type: "text" as const },
    ],
    isError: true,
  };
}

function unauthorizedResult() {
  return {
    content: [
      {
        text: "Authorization failed. Reconnect with a valid PaperBoy API key.",
        type: "text" as const,
      },
    ],
    isError: true,
  };
}

function serializeDomain(
  domain: SendingDomainRecord,
  services: PaperBoyMcpDomainServices,
) {
  return {
    createdAt: protocolTimestamp(domain.createdAt),
    dkimKeys: domain.dkimKeys.map((key) => ({
      activatedAt: key.activatedAt
        ? protocolTimestamp(key.activatedAt)
        : null,
      createdAt: protocolTimestamp(key.createdAt),
      dnsName: dkimDnsName(domain.name, key.selector),
      dnsStatus: key.dnsStatus,
      dnsValue: dkimDnsValue(key.publicKey),
      id: key.id,
      lastCheckedAt: key.lastCheckedAt
        ? protocolTimestamp(key.lastCheckedAt)
        : null,
      retiredAt: key.retiredAt ? protocolTimestamp(key.retiredAt) : null,
      selector: key.selector,
      status: key.status,
      updatedAt: protocolTimestamp(key.updatedAt),
    })),
    dnsChecks: domain.dnsChecks,
    dnsRecords: services.records(domain),
    id: domain.id,
    lastCheckedAt: domain.lastCheckedAt
      ? protocolTimestamp(domain.lastCheckedAt)
      : null,
    name: domain.name,
    status: domain.status,
    updatedAt: protocolTimestamp(domain.updatedAt),
    verifiedAt: domain.verifiedAt
      ? protocolTimestamp(domain.verifiedAt)
      : null,
  };
}

function successResult(output: Record<string, unknown>) {
  return {
    content: [
      { text: JSON.stringify(output, null, 2), type: "text" as const },
    ],
    structuredContent: output,
  };
}

export function registerPaperBoyDomainTools(input: {
  authorize: () => Promise<ApiKeyPrincipal | null>;
  now: () => Date;
  server: McpServer;
  services: PaperBoyMcpDomainServices;
}) {
  async function principal() {
    return input.authorize();
  }

  input.server.registerTool(
    PAPERBOY_DOMAIN_MCP_TOOL_NAMES[0],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: true,
      },
      description: PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS[0].description,
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({
        domains: z.array(domainOutputSchema),
        ...responseMetadataSchema,
      }),
      title: "List PaperBoy sending domains",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async () => {
      const authorized = await principal();

      if (!authorized) {
        return unauthorizedResult();
      }

      try {
        const domains = await input.services.list(authorized);
        return successResult({
          domains: domains.map((domain) =>
            serializeDomain(domain, input.services),
          ),
          observedAt: protocolTimestamp(input.now()),
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DOMAIN_MCP_TOOL_NAMES[1],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS[1].description,
      inputSchema: z.object({ name: z.string().min(1).max(253) }).strict(),
      outputSchema: z.object({
        domain: domainOutputSchema,
        ...responseMetadataSchema,
      }),
      title: "Create PaperBoy sending domain",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ name }) => {
      const authorized = await principal();

      if (!authorized) {
        return unauthorizedResult();
      }

      try {
        const domain = await input.services.create(authorized, name);
        return successResult({
          domain: serializeDomain(domain, input.services),
          observedAt: protocolTimestamp(input.now()),
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DOMAIN_MCP_TOOL_NAMES[2],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        readOnlyHint: false,
      },
      description: PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS[2].description,
      inputSchema: z.object({ domainId: z.string().uuid() }).strict(),
      outputSchema: z.object({
        domain: domainOutputSchema,
        ...responseMetadataSchema,
      }),
      title: "Verify PaperBoy domain DNS",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ domainId }) => {
      const authorized = await principal();

      if (!authorized) {
        return unauthorizedResult();
      }

      try {
        const domain = await input.services.verify(authorized, domainId);
        return successResult({
          domain: serializeDomain(domain, input.services),
          observedAt: protocolTimestamp(input.now()),
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DOMAIN_MCP_TOOL_NAMES[3],
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS[3].description,
      inputSchema: z
        .object({
          confirm: z.literal(true),
          domainId: z.string().uuid(),
        })
        .strict(),
      outputSchema: z.object({
        deleted: z.literal(true),
        domainId: z.string().uuid(),
        ...responseMetadataSchema,
      }),
      title: "Delete PaperBoy sending domain",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ confirm: _confirm, domainId }) => {
      const authorized = await principal();

      if (!authorized) {
        return unauthorizedResult();
      }

      try {
        await input.services.delete(authorized, domainId);
        return successResult({
          deleted: true,
          domainId,
          observedAt: protocolTimestamp(input.now()),
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DOMAIN_MCP_TOOL_NAMES[4],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS[4].description,
      inputSchema: z.object({ domainId: z.string().uuid() }).strict(),
      outputSchema: z.object({
        domain: domainOutputSchema,
        ...responseMetadataSchema,
      }),
      title: "Set up PaperBoy domain DKIM",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ domainId }) => {
      const authorized = await principal();

      if (!authorized) {
        return unauthorizedResult();
      }

      try {
        const domain = await input.services.setupDkim(authorized, domainId);
        return successResult({
          domain: serializeDomain(domain, input.services),
          observedAt: protocolTimestamp(input.now()),
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DOMAIN_MCP_TOOL_NAMES[5],
    {
      annotations: {
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS[5].description,
      inputSchema: z.object({ domainId: z.string().uuid() }).strict(),
      outputSchema: z.object({
        domain: domainOutputSchema,
        ...responseMetadataSchema,
      }),
      title: "Rotate PaperBoy domain DKIM",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ domainId }) => {
      const authorized = await principal();

      if (!authorized) {
        return unauthorizedResult();
      }

      try {
        const domain = await input.services.rotateDkim(authorized, domainId);
        return successResult({
          domain: serializeDomain(domain, input.services),
          observedAt: protocolTimestamp(input.now()),
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  input.server.registerTool(
    PAPERBOY_DOMAIN_MCP_TOOL_NAMES[6],
    {
      annotations: {
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        readOnlyHint: false,
      },
      description: PAPERBOY_DOMAIN_MCP_TOOL_DEFINITIONS[6].description,
      inputSchema: z
        .object({
          confirm: z.literal(true),
          domainId: z.string().uuid(),
        })
        .strict(),
      outputSchema: z.object({
        domain: domainOutputSchema,
        ...responseMetadataSchema,
      }),
      title: "Finalise PaperBoy DKIM rotation",
      _meta: { "paperboy/schemaVersion": PAPERBOY_MCP_SCHEMA_VERSION },
    },
    async ({ confirm: _confirm, domainId }) => {
      const authorized = await principal();

      if (!authorized) {
        return unauthorizedResult();
      }

      try {
        const domain = await input.services.finalizeDkimRotation(
          authorized,
          domainId,
        );
        return successResult({
          domain: serializeDomain(domain, input.services),
          observedAt: protocolTimestamp(input.now()),
          protocolTimeZone: "UTC",
          schemaVersion: PAPERBOY_MCP_SCHEMA_VERSION,
        });
      } catch (error) {
        return errorResult(error);
      }
    },
  );
}
