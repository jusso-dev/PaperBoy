import type { ApiKeyPrincipal } from "@/lib/api-key-auth";
import {
  DomainError,
  createDomain,
  deleteDomain,
  domainDnsRecords,
  listDomains,
  verifyDomain,
} from "@/lib/domains";
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
  list: (principal) =>
    listDomains({
      actorUserId: actorUserId(principal),
      orgId: principal.orgId,
    }),
  records: domainDnsRecords,
  verify: async (principal, domainId) => {
    const result = await verifyDomain({
      actorUserId: actorUserId(principal),
      domainId,
      orgId: principal.orgId,
    });
    return result.domain;
  },
};
