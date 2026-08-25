import {
  inviteAndEmailOrganizationMember,
  listOrganizationInvitationsForActor,
} from "@/lib/organization-invites";
import type { PaperBoyMcpInvitationServices } from "@/mcp/invitation-tools";

export const paperBoyMcpInvitationServices: PaperBoyMcpInvitationServices = {
  invite: (principal, input) =>
    inviteAndEmailOrganizationMember({
      actorUserId: principal.actorUserId,
      email: input.email,
      orgId: principal.orgId,
      role: input.role,
    }),
  list: (principal) =>
    listOrganizationInvitationsForActor({
      actorUserId: principal.actorUserId,
      orgId: principal.orgId,
    }),
};
