import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers } from "@/db/schema";
import { listDomains } from "@/lib/domains";
import { queueEmail } from "@/lib/messages";
import {
  OrganizationInviteEmailError,
  organizationInviteAcceptUrl,
  queueOrganizationInviteEmail,
} from "@/lib/organization-invite-email";
import {
  inviteOrganizationMember,
  listOrganizationInvitations,
  OrganizationError,
} from "@/lib/organizations";
import { findOrganizationById } from "@/lib/organization-reader";
import { getOutboundProviderSettings } from "@/lib/outbound-providers";
import { readySenderDomains } from "@/lib/provider-sender-identities";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";

export type OrganizationInvitationRecord = {
  createdAt: Date;
  email: string;
  id: string;
  role: string;
};

export type OrganizationInviteResult = {
  emailError: "ACCEPT_URL_UNAVAILABLE" | "INVITE_EMAIL" | "SENDER_UNAVAILABLE" | null;
  invitation: OrganizationInvitationRecord;
  queuedId: string | null;
};

async function requireOrganizationActor(input: {
  actorUserId: string | null;
  orgId: string;
  permission: OrgPermission;
}): Promise<string> {
  if (!input.actorUserId) {
    throw new OrganizationError("MEMBERSHIP_REQUIRED");
  }

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
    throw new OrganizationError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, input.permission);
  return input.actorUserId;
}

export async function listOrganizationInvitationsForActor(input: {
  actorUserId: string | null;
  orgId: string;
}): Promise<OrganizationInvitationRecord[]> {
  await requireOrganizationActor({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
    permission: "members.read",
  });
  return listOrganizationInvitations(input.orgId);
}

export async function inviteAndEmailOrganizationMember(input: {
  actorUserId: string | null;
  email: unknown;
  orgId: string;
  orgName?: string;
  role: unknown;
}): Promise<OrganizationInviteResult> {
  const actorUserId = await requireOrganizationActor({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
    permission: "members.invite",
  });
  const invitation = await inviteOrganizationMember({
    actorUserId,
    email: input.email,
    orgId: input.orgId,
    role: input.role,
  });
  const organization =
    input.orgName === undefined
      ? await findOrganizationById(input.orgId)
      : { id: input.orgId, name: input.orgName };

  if (!organization) {
    throw new OrganizationError("INVITATION_NOT_FOUND");
  }

  try {
    const message = await queueOrganizationInviteEmail(
      {
        actorUserId,
        email: invitation.email,
        invitationId: invitation.id,
        orgId: input.orgId,
        orgName: organization.name,
        role: invitation.role,
      },
      {
        acceptUrl: organizationInviteAcceptUrl,
        queue: queueEmail,
        readyDomains: async () => {
          const [domains, outbound] = await Promise.all([
            listDomains({
              actorUserId,
              orgId: input.orgId,
            }),
            getOutboundProviderSettings({
              actorUserId,
              orgId: input.orgId,
            }),
          ]);
          return readySenderDomains({
            defaultProvider: outbound.defaultProvider,
            domains,
            orgId: input.orgId,
            providerDomains: outbound.domains,
          });
        },
      },
    );
    return {
      emailError: null,
      invitation,
      queuedId: message.id,
    };
  } catch (error) {
    return {
      emailError:
        error instanceof OrganizationInviteEmailError
          ? error.code
          : "INVITE_EMAIL",
      invitation,
      queuedId: null,
    };
  }
}
