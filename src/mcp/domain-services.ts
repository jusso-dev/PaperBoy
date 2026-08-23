import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  DomainError,
  createDomain,
  deleteDomain,
  domainDnsRecords,
  getDomain,
  listDomains,
  verifyDomain,
} from "@/lib/domains";
import {
  finalizeDomainDkimRotation,
  rotateDomainDkim,
  setupDomainDkim,
} from "@/lib/dkim";
import type { PaperBoyMcpDomainServices } from "@/mcp/domain-tools";

function actorUserId(principal: ApiKeyPrincipal): string {
  if (!principal.actorUserId) {
    throw new DomainError("MEMBERSHIP_REQUIRED");
  }

  return principal.actorUserId;
}

export const paperBoyMcpDomainServices: PaperBoyMcpDomainServices = {
  create: (principal, name) =>
    createDomain({
      actorUserId: actorUserId(principal),
      name,
      orgId: principal.orgId,
    }),
  delete: (principal, domainId) =>
    deleteDomain({
      actorUserId: actorUserId(principal),
      domainId,
      orgId: principal.orgId,
    }),
  finalizeDkimRotation: async (principal, domainId) => {
    const access = {
      actorUserId: actorUserId(principal),
      domainId,
      orgId: principal.orgId,
    };
    await finalizeDomainDkimRotation(access);
    return getDomain(access);
  },
  list: (principal) =>
    listDomains({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
    }),
  records: domainDnsRecords,
  rotateDkim: async (principal, domainId) => {
    const access = {
      actorUserId: actorUserId(principal),
      domainId,
      orgId: principal.orgId,
    };
    await rotateDomainDkim(access);
    return getDomain(access);
  },
  setupDkim: async (principal, domainId) => {
    const access = {
      actorUserId: actorUserId(principal),
      domainId,
      orgId: principal.orgId,
    };
    await setupDomainDkim(access);
    return getDomain(access);
  },
  verify: async (principal, domainId) => {
    const result = await verifyDomain({
      actorUserId: actorUserId(principal),
      domainId,
      orgId: principal.orgId,
    });
    return result.domain;
  },
};
