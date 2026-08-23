import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { domains, orgMembers, orgs } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";
import {
  OutboundProviderConfigurationError,
  providerRuntimeStatus,
  type ProviderCredentialScope,
  type ProviderRuntimeState,
} from "@/lib/outbound-provider-configuration";
import {
  isLiveOutboundProvider,
  LIVE_OUTBOUND_PROVIDERS,
  OUTBOUND_PROVIDER_CATALOG,
  type LiveOutboundProvider,
  type OutboundProviderConnectionDetails,
  type OutboundProviderCapabilities,
} from "@/lib/outbound-provider-core";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type OutboundProviderStatus = {
  capabilities: OutboundProviderCapabilities;
  configured: boolean;
  credentialScope: ProviderCredentialScope | null;
  id: LiveOutboundProvider;
  label: string;
  state: ProviderRuntimeState;
};

export type OutboundProviderDomainSetting = {
  effectiveProvider: LiveOutboundProvider;
  id: string;
  name: string;
  overrideProvider: LiveOutboundProvider | null;
  updatedAt: Date;
};

export type OutboundProviderSettings = {
  defaultProvider: LiveOutboundProvider;
  domains: OutboundProviderDomainSetting[];
  providers: OutboundProviderStatus[];
  updatedAt: Date;
};

export type OutboundProviderTestResult = {
  details: OutboundProviderConnectionDetails | null;
  provider: LiveOutboundProvider;
  testedAt: Date;
};

export type OutboundProviderValidationIssue = {
  field: string;
  message: string;
};

export class OutboundProviderSettingsError extends Error {
  constructor(
    readonly code:
      | "DOMAIN_NOT_FOUND"
      | "MEMBERSHIP_REQUIRED"
      | "VALIDATION_ERROR",
    readonly issues: OutboundProviderValidationIssue[] = [],
  ) {
    super(code);
    this.name = "OutboundProviderSettingsError";
  }
}

type DomainOverrideInput = {
  domainId: string;
  provider: LiveOutboundProvider | null;
};

type UpdateProviderInput = {
  defaultProvider?: LiveOutboundProvider;
  domainOverrides?: DomainOverrideInput[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function parseUpdateOutboundProvidersInput(
  value: unknown,
): UpdateProviderInput {
  if (!isRecord(value)) {
    throw new OutboundProviderSettingsError("VALIDATION_ERROR", [
      { field: "body", message: "Must be a JSON object." },
    ]);
  }

  const issues: OutboundProviderValidationIssue[] = Object.keys(value)
    .filter(
      (field) => field !== "default_provider" && field !== "domain_overrides",
    )
    .map((field) => ({ field, message: "This field is not supported." }));
  const result: UpdateProviderInput = {};

  if (Object.hasOwn(value, "default_provider")) {
    if (!isLiveOutboundProvider(value.default_provider)) {
      issues.push({
        field: "default_provider",
        message: "Choose smtp, cloudflare-email, aws-ses, or azure-email.",
      });
    } else {
      result.defaultProvider = value.default_provider;
    }
  }

  if (Object.hasOwn(value, "domain_overrides")) {
    if (!Array.isArray(value.domain_overrides) || value.domain_overrides.length > 1000) {
      issues.push({
        field: "domain_overrides",
        message: "Must be an array with at most 1000 domain overrides.",
      });
    } else {
      const seen = new Set<string>();
      const parsed: DomainOverrideInput[] = [];
      value.domain_overrides.forEach((candidate, index) => {
        if (
          !isRecord(candidate) ||
          Object.keys(candidate).some(
            (field) => field !== "domain_id" && field !== "provider",
          )
        ) {
          issues.push({
            field: `domain_overrides.${index}`,
            message: "Must contain only domain_id and provider.",
          });
          return;
        }
        const domainId = candidate.domain_id;
        if (typeof domainId !== "string" || !UUID_PATTERN.test(domainId)) {
          issues.push({
            field: `domain_overrides.${index}.domain_id`,
            message: "Must be a valid domain UUID.",
          });
        } else if (seen.has(domainId)) {
          issues.push({
            field: `domain_overrides.${index}.domain_id`,
            message: "Each domain may appear only once.",
          });
        } else {
          seen.add(domainId);
        }
        const provider = candidate.provider;
        if (provider !== null && !isLiveOutboundProvider(provider)) {
          issues.push({
            field: `domain_overrides.${index}.provider`,
            message:
              "Choose smtp, cloudflare-email, aws-ses, azure-email, or null to inherit.",
          });
        }
        if (
          typeof domainId === "string" &&
          UUID_PATTERN.test(domainId) &&
          !parsed.some((entry) => entry.domainId === domainId) &&
          (provider === null || isLiveOutboundProvider(provider))
        ) {
          parsed.push({ domainId, provider });
        }
      });
      result.domainOverrides = parsed;
    }
  }

  if (
    !Object.hasOwn(value, "default_provider") &&
    !Object.hasOwn(value, "domain_overrides")
  ) {
    issues.push({
      field: "body",
      message: "Provide default_provider, domain_overrides, or both.",
    });
  }

  if (issues.length > 0) {
    throw new OutboundProviderSettingsError("VALIDATION_ERROR", issues);
  }
  return result;
}

export function parseTestOutboundProviderInput(value: unknown): {
  provider: LiveOutboundProvider;
} {
  if (
    !isRecord(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, "provider") ||
    !isLiveOutboundProvider(value.provider)
  ) {
    throw new OutboundProviderSettingsError("VALIDATION_ERROR", [
      {
        field: "provider",
        message: "Choose smtp, cloudflare-email, aws-ses, or azure-email.",
      },
    ]);
  }
  return { provider: value.provider };
}

async function requireOrganizationPermission(input: {
  actorUserId: string;
  orgId: string;
  permission: OrgPermission;
}): Promise<void> {
  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, input.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .limit(1);
  if (!membership || !isOrgRole(membership.role)) {
    throw new OutboundProviderSettingsError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, input.permission);
}

async function readSettings(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
}): Promise<OutboundProviderSettings> {
  const [[organization], domainRows] = await Promise.all([
    db
      .select({
        defaultProvider: orgs.outboundProvider,
        updatedAt: orgs.updatedAt,
      })
      .from(orgs)
      .where(eq(orgs.id, input.orgId))
      .limit(1),
    db
      .select({
        id: domains.id,
        name: domains.name,
        overrideProvider: domains.outboundProvider,
        updatedAt: domains.updatedAt,
      })
      .from(domains)
      .where(eq(domains.orgId, input.orgId))
      .orderBy(asc(domains.name)),
  ]);
  if (!organization) {
    throw new OutboundProviderSettingsError("MEMBERSHIP_REQUIRED");
  }
  const defaultProvider = isLiveOutboundProvider(organization.defaultProvider)
    ? organization.defaultProvider
    : "smtp";
  const providers = LIVE_OUTBOUND_PROVIDERS.map((provider) => {
    const runtime = providerRuntimeStatus({
      environment: input.environment,
      orgId: input.orgId,
      provider,
    });
    return {
      ...OUTBOUND_PROVIDER_CATALOG[provider],
      ...runtime,
      id: provider,
    };
  });

  return {
    defaultProvider,
    domains: domainRows.map((domain) => {
      const overrideProvider = isLiveOutboundProvider(domain.overrideProvider)
        ? domain.overrideProvider
        : null;
      return {
        ...domain,
        effectiveProvider: overrideProvider ?? defaultProvider,
        overrideProvider,
      };
    }),
    providers,
    updatedAt: organization.updatedAt,
  };
}

export async function getOutboundProviderSettings(input: {
  actorUserId: string;
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
}): Promise<OutboundProviderSettings> {
  await requireOrganizationPermission({
    ...input,
    permission: "outboundProviders.read",
  });
  return readSettings(input);
}

export async function updateOutboundProviderSettings(input: {
  actorUserId: string;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<OutboundProviderSettings> {
  const changes = parseUpdateOutboundProvidersInput(input.payload);
  const now = input.now ?? new Date();

  await db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, input.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .for("share");
    if (!membership || !isOrgRole(membership.role)) {
      throw new OutboundProviderSettingsError("MEMBERSHIP_REQUIRED");
    }
    requirePermission(membership.role, "outboundProviders.manage");

    const domainOverrides = changes.domainOverrides ?? [];
    if (domainOverrides.length > 0) {
      const ids = domainOverrides.map((entry) => entry.domainId);
      const owned = await tx
        .select({ id: domains.id })
        .from(domains)
        .where(and(eq(domains.orgId, input.orgId), inArray(domains.id, ids)))
        .for("update");
      if (owned.length !== ids.length) {
        throw new OutboundProviderSettingsError("DOMAIN_NOT_FOUND");
      }
      for (const override of domainOverrides) {
        await tx
          .update(domains)
          .set({ outboundProvider: override.provider, updatedAt: now })
          .where(
            and(
              eq(domains.id, override.domainId),
              eq(domains.orgId, input.orgId),
            ),
          );
      }
    }

    const [updated] = await tx
      .update(orgs)
      .set({
        ...(changes.defaultProvider === undefined
          ? {}
          : { outboundProvider: changes.defaultProvider }),
        updatedAt: now,
      })
      .where(eq(orgs.id, input.orgId))
      .returning({ id: orgs.id });
    if (!updated) {
      throw new OutboundProviderSettingsError("MEMBERSHIP_REQUIRED");
    }
  });

  return readSettings(input);
}

export async function testOutboundProviderConnection(input: {
  actorUserId: string;
  environment?: Readonly<Record<string, string | undefined>>;
  now?: Date;
  orgId: string;
  payload: unknown;
  testConnection: (input: {
    environment?: Readonly<Record<string, string | undefined>>;
    orgId: string;
    provider: LiveOutboundProvider;
  }) => Promise<OutboundProviderConnectionDetails | null>;
}): Promise<OutboundProviderTestResult> {
  const { provider } = parseTestOutboundProviderInput(input.payload);
  await requireOrganizationPermission({
    ...input,
    permission: "outboundProviders.manage",
  });

  try {
    const details = await input.testConnection({
      environment: input.environment,
      orgId: input.orgId,
      provider,
    });
    return { details, provider, testedAt: input.now ?? new Date() };
  } catch (error) {
    if (error instanceof OutboundProviderConfigurationError) throw error;
    throw new OutboundProviderConfigurationError(
      "CONNECTION_FAILED",
      provider,
    );
  }
}
