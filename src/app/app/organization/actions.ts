"use server";

import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import {
  OpenTrackingConfigurationError,
  OpenTrackingSettingsError,
} from "@/lib/open-tracking-core";
import { updateOpenTrackingSettings } from "@/lib/open-tracking";
import { OutboundProviderConfigurationError } from "@/lib/outbound-provider-configuration";
import { testConfiguredOutboundProvider } from "@/lib/outbound-provider-runtime";
import {
  OutboundProviderSettingsError,
  testOutboundProviderConnection,
  updateOutboundProviderSettings,
} from "@/lib/outbound-providers";
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

  if (error instanceof OpenTrackingSettingsError) {
    return error.code === "MEMBERSHIP_REQUIRED"
      ? "/app/organization?error=membership_required"
      : "/app/organization?error=invalid_open_tracking";
  }

  if (error instanceof OpenTrackingConfigurationError) {
    return "/app/organization?error=open_tracking_configuration";
  }

  if (error instanceof OutboundProviderSettingsError) {
    if (error.code === "MEMBERSHIP_REQUIRED") {
      return "/app/organization?error=membership_required";
    }
    if (error.code === "DOMAIN_NOT_FOUND") {
      return "/app/organization?error=provider_domain_not_found";
    }
    return "/app/organization?error=invalid_provider_settings";
  }

  if (error instanceof OutboundProviderConfigurationError) {
    return `/app/organization?error=provider_${error.code.toLowerCase()}`;
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

export async function updateOpenTrackingAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await updateOpenTrackingSettings({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: { enabled: formData.get("enabled") === "on" },
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization?saved=open-tracking");
}

export async function updateDefaultOutboundProviderAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await updateOutboundProviderSettings({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: { default_provider: formData.get("provider") },
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization?saved=outbound-provider");
}

export async function updateDomainOutboundProviderAction(formData: FormData) {
  const { organization, session } = await requireOrganization();
  const selected = formData.get("provider");

  try {
    await updateOutboundProviderSettings({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: {
        domain_overrides: [
          {
            domain_id: formData.get("domainId"),
            provider: selected === "" ? null : selected,
          },
        ],
      },
    });
  } catch (error) {
    redirect(errorLocation(error));
  }

  redirect("/app/organization?saved=domain-provider");
}

export async function testOutboundProviderAction(formData: FormData) {
  const { organization, session } = await requireOrganization();
  let details: Awaited<
    ReturnType<typeof testOutboundProviderConnection>
  >["details"] = null;

  try {
    const result = await testOutboundProviderConnection({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: { provider: formData.get("provider") },
      testConnection: testConfiguredOutboundProvider,
    });
    details = result.details;
  } catch (error) {
    redirect(errorLocation(error));
  }

  const search = new URLSearchParams({ saved: "provider-tested" });
  if (details) {
    search.set("providerMode", details.accountMode);
    search.set("providerRegion", details.region);
    search.set("providerSending", String(details.sendingEnabled));
    search.set("providerDomainCount", String(details.verifiedDomains.length));
    search.set("providerDomains", details.verifiedDomains.slice(0, 20).join(","));
  }
  redirect(`/app/organization?${search.toString()}`);
}
