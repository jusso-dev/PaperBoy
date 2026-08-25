"use server";

import { redirect } from "next/navigation";
import { isOrganizationInvitationId } from "@/lib/organization-invite-access";
import {
  acceptOrganizationInvitation,
  OrganizationError,
} from "@/lib/organizations";
import { requireSession } from "@/lib/session";

export async function acceptInvitationFromLinkAction(formData: FormData) {
  const invitationId = String(formData.get("invitationId"));
  if (!isOrganizationInvitationId(invitationId)) {
    redirect("/sign-in");
  }

  const session = await requireSession();

  try {
    await acceptOrganizationInvitation({
      email: session.user.email,
      invitationId,
      userId: session.user.id,
    });
  } catch (error) {
    if (error instanceof OrganizationError) {
      redirect(`/invite/${invitationId}?error=unavailable`);
    }
    throw error;
  }

  redirect("/app/organization?saved=accepted");
}
