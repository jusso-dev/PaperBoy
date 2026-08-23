"use server";

import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import {
  acceptOrganizationInvitation,
  inviteOrganizationMember,
  OrganizationError,
  removeOrganizationMember,
  switchActiveOrganization,
} from "@/lib/organizations";
import { requireOrganization, requireSession } from "@/lib/session";

function errorLocation(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "/app/organization?error=forbidden";
  }

  if (error instanceof OrganizationError) {
    return `/app/organization?error=${error.code.toLowerCase()}`;
  }

  throw error;
}

export async function inviteMemberAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await inviteOrganizationMember({
      actorUserId: session.user.id,
      email: formData.get("email"),
      orgId: organization.id,
      role: formData.get("role"),
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization?saved=invitation");
}

export async function acceptInvitationAction(formData: FormData) {
  const session = await requireSession();

  try {
    await acceptOrganizationInvitation({
      email: session.user.email,
      invitationId: String(formData.get("invitationId")),
      userId: session.user.id,
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization?saved=accepted");
}

export async function switchOrganizationAction(formData: FormData) {
  const session = await requireSession();

  try {
    await switchActiveOrganization({
      orgId: String(formData.get("orgId")),
      userId: session.user.id,
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization");
}

export async function removeMemberAction(formData: FormData) {
  const session = await requireSession();

  try {
    await removeOrganizationMember({
      actorUserId: session.user.id,
      membershipId: String(formData.get("membershipId")),
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization?saved=removed");
}
