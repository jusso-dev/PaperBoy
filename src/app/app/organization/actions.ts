"use server";

import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import {
  RateLimitConfigurationError,
  RateLimitSettingsError,
} from "@/lib/rate-limit-core";
import { updateRateLimitSettings } from "@/lib/rate-limits";
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

  if (error instanceof RateLimitSettingsError) {
    return error.code === "MEMBERSHIP_REQUIRED"
      ? "/app/organization?error=membership_required"
      : "/app/organization?error=invalid_rate_limits";
  }

  if (error instanceof RateLimitConfigurationError) {
    return "/app/organization?error=rate_limit_configuration";
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

function formLimit(value: FormDataEntryValue | null): number | null {
  return typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : null;
}

export async function updateRateLimitsAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await updateRateLimitSettings({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: {
        live_limit_per_minute: formLimit(
          formData.get("liveLimitPerMinute"),
        ),
        test_limit_per_minute: formLimit(
          formData.get("testLimitPerMinute"),
        ),
      },
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization?saved=rate-limits");
}
