"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { queueConsoleTestEmail } from "@/lib/console-send";
import { DomainError } from "@/lib/domains";
import { EmailError } from "@/lib/email-core";
import { OpenTrackingConfigurationError } from "@/lib/open-tracking-core";
import {
  OutboundProviderConfigurationError,
  providerConfigurationErrorMessage,
} from "@/lib/outbound-provider-configuration";
import {
  RateLimitConfigurationError,
  RateLimitError,
} from "@/lib/rate-limit-core";
import { requireOrganization } from "@/lib/session";

function optionalBody(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  return value;
}

function sendErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow live test sends.";
  }

  if (error instanceof DomainError) {
    if (error.code === "MEMBERSHIP_REQUIRED") {
      return "Your organisation membership is no longer available.";
    }
    if (error.code === "DOMAIN_NOT_FOUND") {
      return "Choose a sending domain from this organisation.";
    }
    if (error.code === "DOMAIN_NOT_VERIFIED") {
      return "That domain is not ready for live sending. Check its DNS and DKIM status.";
    }
    return "The selected sending domain is not valid.";
  }

  if (error instanceof EmailError) {
    return error.issues[0]?.message ?? "Check the recipient and message fields.";
  }

  if (error instanceof RateLimitError) {
    return `The live send limit has been reached. Try again in ${error.retryAfterSeconds} seconds.`;
  }

  if (error instanceof RateLimitConfigurationError) {
    return "The operator must correct the live and test rate-limit configuration.";
  }

  if (error instanceof OpenTrackingConfigurationError) {
    return "The operator must configure the public URL and open-tracking signing key.";
  }

  if (error instanceof OutboundProviderConfigurationError) {
    return providerConfigurationErrorMessage(error);
  }

  throw error;
}

function errorRedirect(error: unknown): never {
  redirect(`/app/send?error=${encodeURIComponent(sendErrorMessage(error))}`);
}

export async function sendTestEmailAction(formData: FormData) {
  const { organization, session } = await requireOrganization();
  let messageId: string;

  try {
    const message = await queueConsoleTestEmail({
      actorUserId: session.user.id,
      domainId: formData.get("domainId"),
      html: optionalBody(formData.get("html")),
      orgId: organization.id,
      subject: formData.get("subject"),
      text: optionalBody(formData.get("text")),
      to: formData.get("to"),
    });
    messageId = message.id;
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/logs");
  revalidatePath("/app/send");
  redirect(`/app/send?queued=${messageId}`);
}
