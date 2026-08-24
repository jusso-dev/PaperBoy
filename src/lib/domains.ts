import { resolveTxt } from "node:dns/promises";
import { randomUUID } from "node:crypto";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { domainDkimKeys, domains, orgMembers, orgs } from "@/db/schema";
import type { ApiKeyEnvironment } from "@/lib/api-key-crypto";
import {
  DEFAULT_SPF_RECORD,
  DomainError,
  buildDkimDnsRecord,
  buildDomainDnsRecords,
  checkDomainDnsRecord,
  decideDkimVerification,
  domainDeliveryMode,
  isDomainStatus,
  normalizeDnsChecks,
  normalizeSendingDomain,
  verifyDomainDns,
  type DomainDnsCheckSnapshot,
  type DomainDnsRecord,
  type DomainStatus,
  type TxtResolver,
} from "@/lib/domain-core";
import {
  dkimDnsValue,
  prepareEncryptedDkimKey,
} from "@/lib/dkim-core";
import {
  dkimKeysByDomainIds,
  type DkimKeyRecord,
} from "@/lib/dkim";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
  type OrgRole,
} from "@/lib/authorization";
import { requireProviderConfigured } from "@/lib/outbound-provider-configuration";
import { isLiveOutboundProvider } from "@/lib/outbound-provider-core";
import { isPostgresErrorCode } from "@/lib/postgres-errors";

export { DomainError } from "@/lib/domain-core";
export type { DomainErrorCode } from "@/lib/domain-core";

export type SendingDomainRecord = {
  createdAt: Date;
  dkimKeys: DkimKeyRecord[];
  dnsChecks: DomainDnsCheckSnapshot;
  id: string;
  lastCheckedAt: Date | null;
  name: string;
  status: DomainStatus;
  updatedAt: Date;
  verificationToken: string;
  verifiedAt: Date | null;
};

type DomainAccess = SendingDomainRecord & { role: OrgRole };

function isUniqueViolation(error: unknown): boolean {
  return isPostgresErrorCode(error, "23505");
}

export function configuredSpfRecord(): string {
  const configured = process.env.PAPERBOY_SPF_RECORD?.trim();

  if (!configured) {
    return DEFAULT_SPF_RECORD;
  }

  if (!/^v=spf1(?:\s|$)/i.test(configured)) {
    throw new DomainError("DNS_CONFIGURATION_INVALID");
  }

  return configured;
}

function normalizeDomainRow(
  row: {
    createdAt: Date;
    dnsChecks: unknown;
    id: string;
    lastCheckedAt: Date | null;
    name: string;
    status: string;
    updatedAt: Date;
    verificationToken: string;
    verifiedAt: Date | null;
  },
  dkimKeys: DkimKeyRecord[] = [],
): SendingDomainRecord {
  return {
    ...row,
    dkimKeys,
    dnsChecks: normalizeDnsChecks(row.dnsChecks),
    status: isDomainStatus(row.status) ? row.status : "pending",
  };
}

async function requireOrganizationRole(input: {
  actorUserId: string;
  orgId: string;
  permission: OrgPermission;
}): Promise<OrgRole> {
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
    throw new DomainError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, input.permission);
  return membership.role;
}

async function getDomainAccess(input: {
  actorUserId: string;
  domainId: string;
  orgId: string;
  permission: OrgPermission;
}): Promise<DomainAccess> {
  const [row] = await db
    .select({
      createdAt: domains.createdAt,
      dnsChecks: domains.dnsChecks,
      id: domains.id,
      lastCheckedAt: domains.lastCheckedAt,
      name: domains.name,
      role: orgMembers.role,
      status: domains.status,
      updatedAt: domains.updatedAt,
      verificationToken: domains.verificationToken,
      verifiedAt: domains.verifiedAt,
    })
    .from(domains)
    .innerJoin(
      orgMembers,
      and(
        eq(orgMembers.orgId, domains.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .where(and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)))
    .limit(1);

  if (!row || !isOrgRole(row.role)) {
    throw new DomainError("DOMAIN_NOT_FOUND");
  }

  requirePermission(row.role, input.permission);

  const keys = await dkimKeysByDomainIds([row.id]);

  return {
    ...normalizeDomainRow(row, keys.get(row.id) ?? []),
    role: row.role,
  };
}

function currentSigningKey(domain: SendingDomainRecord): DkimKeyRecord | undefined {
  const keys = domain.dkimKeys.filter((key) => key.status !== "retired");
  return (
    keys.find((key) => key.status === "active") ??
    keys.find((key) => key.status === "pending")
  );
}

function domainVerificationRecords(
  domain: SendingDomainRecord,
): DomainDnsRecord[] {
  const primary = currentSigningKey(domain);

  return buildDomainDnsRecords({
    dkim: primary
      ? {
          selector: primary.selector,
          value: dkimDnsValue(primary.publicKey),
        }
      : null,
    domain: domain.name,
    spfValue: configuredSpfRecord(),
    verificationToken: domain.verificationToken,
  });
}

export function domainDnsRecords(domain: SendingDomainRecord): DomainDnsRecord[] {
  const keys = domain.dkimKeys.filter((key) => key.status !== "retired");
  const primary = currentSigningKey(domain);
  const records = domainVerificationRecords(domain);
  const primaryRecord = records.find((record) => record.key === "dkim");

  if (primaryRecord && primary) {
    primaryRecord.lifecycle = primary.status;
    primaryRecord.status = primary.dnsStatus;
  }

  const extraRecords = keys
    .filter((key) => key.id !== primary?.id)
    .map((key) =>
      buildDkimDnsRecord({
        description:
          key.status === "pending"
            ? "Publish this next selector. PaperBoy keeps signing with the active key until it matches."
            : "Keep this retiring selector published until rotation is finalised.",
        domain: domain.name,
        lifecycle: key.status,
        required: false,
        selector: key.selector,
        status: key.dnsStatus,
        value: dkimDnsValue(key.publicKey),
      }),
    );
  const dmarcIndex = records.findIndex((record) => record.key === "dmarc");
  records.splice(dmarcIndex, 0, ...extraRecords);

  return records;
}

export async function createDomain(input: {
  actorUserId: string;
  name: unknown;
  orgId: string;
}): Promise<SendingDomainRecord> {
  const name = normalizeSendingDomain(input.name);

  if (!name) {
    throw new DomainError("INVALID_DOMAIN");
  }

  await requireOrganizationRole({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
    permission: "domains.create",
  });
  const domainId = randomUUID();
  const preparedKey = await prepareEncryptedDkimKey({ domainId });

  try {
    const created = await db.transaction(async (tx) => {
      const [membership] = await tx
        .select({ role: orgMembers.role })
        .from(orgMembers)
        .where(
          and(
            eq(orgMembers.orgId, input.orgId),
            eq(orgMembers.userId, input.actorUserId),
          ),
        )
        .for("update");

      if (!membership || !isOrgRole(membership.role)) {
        throw new DomainError("MEMBERSHIP_REQUIRED");
      }

      requirePermission(membership.role, "domains.create");

      const [created] = await tx
        .insert(domains)
        .values({ id: domainId, name, orgId: input.orgId })
        .returning({
          createdAt: domains.createdAt,
          dnsChecks: domains.dnsChecks,
          id: domains.id,
          lastCheckedAt: domains.lastCheckedAt,
          name: domains.name,
          status: domains.status,
          updatedAt: domains.updatedAt,
          verificationToken: domains.verificationToken,
          verifiedAt: domains.verifiedAt,
        });

      if (!created) {
        throw new DomainError("DOMAIN_NOT_FOUND");
      }

      await tx.insert(domainDkimKeys).values({
        domainId,
        encryptedPrivateKey: preparedKey.encryptedPrivateKey,
        id: preparedKey.id,
        publicKey: preparedKey.publicKey,
        selector: preparedKey.selector,
        status: "pending",
      });

      return created;
    });
    const keys = await dkimKeysByDomainIds([created.id]);
    return normalizeDomainRow(created, keys.get(created.id) ?? []);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new DomainError("DOMAIN_EXISTS");
    }

    throw error;
  }
}

export async function listDomains(input: {
  actorUserId: string;
  orgId: string;
}): Promise<SendingDomainRecord[]> {
  await requireOrganizationRole({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
    permission: "domains.read",
  });

  const rows = await db
    .select({
      createdAt: domains.createdAt,
      dnsChecks: domains.dnsChecks,
      id: domains.id,
      lastCheckedAt: domains.lastCheckedAt,
      name: domains.name,
      status: domains.status,
      updatedAt: domains.updatedAt,
      verificationToken: domains.verificationToken,
      verifiedAt: domains.verifiedAt,
    })
    .from(domains)
    .where(eq(domains.orgId, input.orgId))
    .orderBy(asc(domains.name));

  const keys = await dkimKeysByDomainIds(rows.map((row) => row.id));
  return rows.map((row) => normalizeDomainRow(row, keys.get(row.id) ?? []));
}

export async function getDomain(input: {
  actorUserId: string;
  domainId: string;
  orgId: string;
}): Promise<SendingDomainRecord> {
  const { role: _role, ...domain } = await getDomainAccess({
    ...input,
    permission: "domains.read",
  });

  return domain;
}

export async function verifyDomain(input: {
  actorUserId: string;
  domainId: string;
  orgId: string;
  resolveTxt?: TxtResolver;
}) {
  const domain = await getDomainAccess({
    ...input,
    permission: "domains.verify",
  });
  const resolver = input.resolveTxt ?? resolveTxt;
  const verificationRecords = domainVerificationRecords(domain);
  const result = await verifyDomainDns(verificationRecords, resolver);
  const primary = currentSigningKey(domain);
  const currentKeys = domain.dkimKeys.filter((key) => key.status !== "retired");
  const keyChecks = new Map(
    await Promise.all(
      currentKeys.map(async (key) => [
        key.id,
        key.id === primary?.id
          ? result.checks.dkim
          : await checkDomainDnsRecord(
              buildDkimDnsRecord({
                domain: domain.name,
                required: false,
                selector: key.selector,
                value: dkimDnsValue(key.publicKey),
              }),
              resolver,
            ),
      ] as const),
    ),
  );
  const active = currentKeys.find((key) => key.status === "active");
  const pending = currentKeys.find((key) => key.status === "pending");
  const infrastructureMatched =
    result.checks.ownership === "matched" && result.checks.spf === "matched";
  const { activatePending, dkimCheck, verified } = decideDkimVerification({
    active: active ? keyChecks.get(active.id) ?? "unchecked" : null,
    infrastructureMatched,
    pending: pending ? keyChecks.get(pending.id) ?? "pending" : null,
  });
  const checkedAt = new Date();
  const status: DomainStatus = verified ? "verified" : "pending";
  const updated = await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ role: orgMembers.role, verifiedAt: domains.verifiedAt })
      .from(domains)
      .innerJoin(
        orgMembers,
        and(
          eq(orgMembers.orgId, domains.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .where(
        and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)),
      )
      .for("update");

    if (!current || !isOrgRole(current.role)) {
      throw new DomainError("DOMAIN_NOT_FOUND");
    }

    requirePermission(current.role, "domains.verify");

    const lockedKeys = await tx
      .select({ id: domainDkimKeys.id, status: domainDkimKeys.status })
      .from(domainDkimKeys)
      .where(
        and(
          eq(domainDkimKeys.domainId, input.domainId),
          ne(domainDkimKeys.status, "retired"),
        ),
      )
      .for("update");

    if (
      lockedKeys.length !== currentKeys.length ||
      lockedKeys.some(
        (key) =>
          !currentKeys.some(
            (original) =>
              original.id === key.id && original.status === key.status,
          ),
      )
    ) {
      throw new DomainError("DOMAIN_NOT_FOUND");
    }

    for (const [keyId, dnsStatus] of keyChecks) {
      await tx
        .update(domainDkimKeys)
        .set({ dnsStatus, lastCheckedAt: checkedAt, updatedAt: checkedAt })
        .where(
          and(
            eq(domainDkimKeys.id, keyId),
            eq(domainDkimKeys.domainId, input.domainId),
          ),
        );
    }

    if (activatePending && pending) {
      if (active) {
        await tx
          .update(domainDkimKeys)
          .set({ status: "retiring", updatedAt: checkedAt })
          .where(
            and(
              eq(domainDkimKeys.id, active.id),
              eq(domainDkimKeys.domainId, input.domainId),
              eq(domainDkimKeys.status, "active"),
            ),
          );
      }

      await tx
        .update(domainDkimKeys)
        .set({
          activatedAt: checkedAt,
          status: "active",
          updatedAt: checkedAt,
        })
        .where(
          and(
            eq(domainDkimKeys.id, pending.id),
            eq(domainDkimKeys.domainId, input.domainId),
            eq(domainDkimKeys.status, "pending"),
          ),
        );
    }

    const [saved] = await tx
      .update(domains)
      .set({
        dnsChecks: { ...result.checks, dkim: dkimCheck },
        lastCheckedAt: checkedAt,
        status,
        updatedAt: checkedAt,
        verifiedAt: verified ? current.verifiedAt ?? checkedAt : null,
      })
      .where(
        and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)),
      )
      .returning({
        createdAt: domains.createdAt,
        dnsChecks: domains.dnsChecks,
        id: domains.id,
        lastCheckedAt: domains.lastCheckedAt,
        name: domains.name,
        status: domains.status,
        updatedAt: domains.updatedAt,
        verificationToken: domains.verificationToken,
        verifiedAt: domains.verifiedAt,
      });

    return saved;
  });

  if (!updated) {
    throw new DomainError("DOMAIN_NOT_FOUND");
  }

  const keys = await dkimKeysByDomainIds([updated.id]);
  const savedDomain = normalizeDomainRow(updated, keys.get(updated.id) ?? []);
  return { domain: savedDomain, records: domainDnsRecords(savedDomain) };
}

export async function deleteDomain(input: {
  actorUserId: string;
  domainId: string;
  orgId: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const [access] = await tx
      .select({ role: orgMembers.role })
      .from(domains)
      .innerJoin(
        orgMembers,
        and(
          eq(orgMembers.orgId, domains.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .where(
        and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)),
      )
      .for("update");

    if (!access || !isOrgRole(access.role)) {
      throw new DomainError("DOMAIN_NOT_FOUND");
    }

    requirePermission(access.role, "domains.delete");

    const [deleted] = await tx
      .delete(domains)
      .where(
        and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)),
      )
      .returning({ id: domains.id });

    if (!deleted) {
      throw new DomainError("DOMAIN_NOT_FOUND");
    }
  });
}

export async function authorizeSendingDomain(input: {
  environment: ApiKeyEnvironment;
  fromDomain: unknown;
  orgId: string;
  providerEnvironment?: Readonly<Record<string, string | undefined>>;
}) {
  const name = normalizeSendingDomain(input.fromDomain);

  if (!name) {
    throw new DomainError("INVALID_DOMAIN");
  }

  if (input.environment === "test") {
    return {
      domainId: null,
      mode: "test-sink" as const,
      name,
      provider: "test-sink" as const,
    };
  }

  const [domain] = await db
    .select({
      dkimKeyId: domainDkimKeys.id,
      id: domains.id,
      orgProvider: orgs.outboundProvider,
      overrideProvider: domains.outboundProvider,
      status: domains.status,
    })
    .from(domains)
    .innerJoin(orgs, eq(orgs.id, domains.orgId))
    .innerJoin(
      domainDkimKeys,
      and(
        eq(domainDkimKeys.domainId, domains.id),
        eq(domainDkimKeys.status, "active"),
      ),
    )
    .where(and(eq(domains.orgId, input.orgId), eq(domains.name, name)))
    .limit(1);

  if (
    !domain ||
    domainDeliveryMode(
      input.environment,
      domain.status,
      Boolean(domain.dkimKeyId),
    ) !== "live"
  ) {
    throw new DomainError("DOMAIN_NOT_VERIFIED");
  }

  const provider = isLiveOutboundProvider(domain.overrideProvider)
    ? domain.overrideProvider
    : isLiveOutboundProvider(domain.orgProvider)
      ? domain.orgProvider
      : "smtp";
  requireProviderConfigured({
    environment: input.providerEnvironment,
    orgId: input.orgId,
    provider,
  });

  return { domainId: domain.id, mode: "live" as const, name, provider };
}
