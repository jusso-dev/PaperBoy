import { resolveTxt } from "node:dns/promises";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { domains, orgMembers } from "@/db/schema";
import type { ApiKeyEnvironment } from "@/lib/api-key-crypto";
import {
  DEFAULT_SPF_RECORD,
  DomainError,
  buildDomainDnsRecords,
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
  isOrgRole,
  requirePermission,
  type OrgPermission,
  type OrgRole,
} from "@/lib/authorization";

export { DomainError } from "@/lib/domain-core";
export type { DomainErrorCode } from "@/lib/domain-core";

export type SendingDomainRecord = {
  createdAt: Date;
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
  if (!error || typeof error !== "object") {
    return false;
  }

  if ("code" in error && error.code === "23505") {
    return true;
  }

  return "cause" in error && isUniqueViolation(error.cause);
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

function normalizeDomainRow(row: {
  createdAt: Date;
  dnsChecks: unknown;
  id: string;
  lastCheckedAt: Date | null;
  name: string;
  status: string;
  updatedAt: Date;
  verificationToken: string;
  verifiedAt: Date | null;
}): SendingDomainRecord {
  return {
    ...row,
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

  return { ...normalizeDomainRow(row), role: row.role };
}

export function domainDnsRecords(domain: SendingDomainRecord): DomainDnsRecord[] {
  return buildDomainDnsRecords({
    domain: domain.name,
    spfValue: configuredSpfRecord(),
    verificationToken: domain.verificationToken,
  });
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

  try {
    return await db.transaction(async (tx) => {
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
        .values({ name, orgId: input.orgId })
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

      return normalizeDomainRow(created);
    });
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

  return rows.map(normalizeDomainRow);
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
  const records = domainDnsRecords(domain);
  const result = await verifyDomainDns(records, input.resolveTxt ?? resolveTxt);
  const checkedAt = new Date();
  const status: DomainStatus = result.verified ? "verified" : "pending";
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

    const [saved] = await tx
      .update(domains)
      .set({
        dnsChecks: result.checks,
        lastCheckedAt: checkedAt,
        status,
        updatedAt: checkedAt,
        verifiedAt: result.verified ? current.verifiedAt ?? checkedAt : null,
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

  return { domain: normalizeDomainRow(updated), records };
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
}) {
  const name = normalizeSendingDomain(input.fromDomain);

  if (!name) {
    throw new DomainError("INVALID_DOMAIN");
  }

  if (input.environment === "test") {
    return { domainId: null, mode: "test-sink" as const, name };
  }

  const [domain] = await db
    .select({ id: domains.id, status: domains.status })
    .from(domains)
    .where(and(eq(domains.orgId, input.orgId), eq(domains.name, name)))
    .limit(1);

  if (!domain || domainDeliveryMode(input.environment, domain.status) !== "live") {
    throw new DomainError("DOMAIN_NOT_VERIFIED");
  }

  return { domainId: domain.id, mode: "live" as const, name };
}
