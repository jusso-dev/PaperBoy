"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { AudienceError } from "@/lib/audience-core";
import { BroadcastError } from "@/lib/broadcast-core";
import {
  queueBroadcastTestEmail,
  type BroadcastTestSendState,
} from "@/lib/broadcast-test-send";
import {
  cancelBroadcast,
  createBroadcast,
  getBroadcast,
  pauseBroadcast,
  resumeBroadcast,
  updateScheduledBroadcast,
} from "@/lib/broadcasts";
import { requireConsoleSendPermission } from "@/lib/console-send";
import { DomainError } from "@/lib/domains";
import { EmailError } from "@/lib/email-core";
import { OpenTrackingConfigurationError } from "@/lib/open-tracking-core";
import {
  OutboundProviderConfigurationError,
  providerConfigurationErrorMessage,
} from "@/lib/outbound-provider-configuration";
import { parseNaturalLanguageSchedule } from "@/lib/natural-language-schedule";
import {
  RateLimitConfigurationError,
  RateLimitError,
} from "@/lib/rate-limit-core";
import { queueEmail } from "@/lib/messages";
import { requireOrganization } from "@/lib/session";
import { TemplateError } from "@/lib/template-core";
import { parseLocalDateTime } from "@/lib/time";
import { UnsubscribeConfigurationError } from "@/lib/unsubscribe-core";

function errorCode(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "forbidden";
  }

  if (error instanceof AudienceError) {
    return error.code === "AUDIENCE_EMPTY" ? "audience-empty" : "audience-not-found";
  }

  if (error instanceof TemplateError) {
    return error.code === "TEMPLATE_NOT_FOUND"
      ? "template-not-found"
      : "validation";
  }

  if (error instanceof UnsubscribeConfigurationError) {
    return "unsubscribe-unavailable";
  }

  if (error instanceof BroadcastError) {
    if (error.code === "BROADCAST_NOT_FOUND") {
      return "not-found";
    }

    if (error.code === "INVALID_TRANSITION") {
      return "invalid-transition";
    }

    return error.code === "VALIDATION_ERROR" ? "validation" : "forbidden";
  }

  throw error;
}

export async function createBroadcastAction(formData: FormData) {
  const { organization, session } = await requireOrganization();
  if (formData.get("consentConfirmed") !== "yes") {
    redirect("/app/broadcasts?error=consent-required");
  }

  const delivery = formData.get("delivery");
  let scheduledFor: Date | null = null;
  if (delivery === "scheduled") {
    scheduledFor = parseLocalDateTime(
      formData.get("scheduledLocal"),
      session.user.timezone,
    );
    if (!scheduledFor) redirect("/app/broadcasts?error=invalid-schedule");
  } else if (delivery !== "now") {
    redirect("/app/broadcasts?error=invalid-schedule");
  }

  try {
    await createBroadcast({
      payload: {
        audience_id: formData.get("audienceId"),
        from: formData.get("from"),
        name: formData.get("name"),
        ...(scheduledFor ? { scheduled_for: scheduledFor.toISOString() } : {}),
        template_id: formData.get("templateId"),
      },
      principal: {
        actorUserId: session.user.id,
        apiKeyId: null,
        environment: "live",
        orgId: organization.id,
      },
    });
  } catch (error) {
    redirect(`/app/broadcasts?error=${errorCode(error)}`);
  }

  revalidatePath("/app/broadcasts");
  redirect(`/app/broadcasts?success=${scheduledFor ? "scheduled" : "created"}`);
}

async function control(
  broadcastId: string,
  operation: "cancel" | "pause" | "resume",
): Promise<never> {
  const { organization, session } = await requireOrganization();
  const input = {
    actorUserId: session.user.id,
    broadcastId,
    orgId: organization.id,
  };

  try {
    if (operation === "cancel") {
      await cancelBroadcast(input);
    } else if (operation === "pause") {
      await pauseBroadcast(input);
    } else {
      await resumeBroadcast(input);
    }
  } catch (error) {
    redirect(`/app/broadcasts?error=${errorCode(error)}`);
  }

  revalidatePath("/app/broadcasts");
  redirect(`/app/broadcasts?success=${operation}`);
}

export async function pauseBroadcastAction(formData: FormData) {
  return control(String(formData.get("broadcastId") ?? ""), "pause");
}

export async function resumeBroadcastAction(formData: FormData) {
  return control(String(formData.get("broadcastId") ?? ""), "resume");
}

export async function cancelBroadcastAction(formData: FormData) {
  return control(String(formData.get("broadcastId") ?? ""), "cancel");
}

export async function updateBroadcastAction(formData: FormData) {
  const { organization, session } = await requireOrganization();
  const broadcastId = String(formData.get("broadcastId") ?? "");
  const schedule = parseNaturalLanguageSchedule(
    formData.get("scheduleText"),
    new Date(),
    session.user.timezone,
  );
  if (!schedule.date) {
    redirect(
      `/app/broadcasts/${encodeURIComponent(broadcastId)}/preview?error=invalid-schedule`,
    );
  }

  try {
    await updateScheduledBroadcast({
      actorUserId: session.user.id,
      broadcastId,
      orgId: organization.id,
      payload: {
        audience_id: formData.get("audienceId"),
        from: formData.get("from"),
        ...(typeof formData.get("html") === "string"
          ? { html: formData.get("html") }
          : {}),
        scheduled_for: schedule.date.toISOString(),
        subject: formData.get("subject"),
      },
    });
  } catch (error) {
    redirect(
      `/app/broadcasts/${encodeURIComponent(broadcastId)}/preview?error=${errorCode(error)}`,
    );
  }

  revalidatePath("/app/broadcasts");
  revalidatePath(`/app/broadcasts/${broadcastId}/preview`);
  redirect(
    `/app/broadcasts/${encodeURIComponent(broadcastId)}/preview?success=updated`,
  );
}

function testSendErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow live test sends.";
  }

  if (error instanceof DomainError) {
    if (error.code === "MEMBERSHIP_REQUIRED") {
      return "Your organisation membership is no longer available.";
    }
    if (error.code === "DOMAIN_NOT_FOUND") {
      return "The broadcast from-address domain is not in this organisation.";
    }
    if (error.code === "DOMAIN_NOT_VERIFIED") {
      return "The broadcast from-address domain is not ready for live sending.";
    }
    return "The broadcast from-address is not valid for live sending.";
  }

  if (error instanceof EmailError) {
    return error.issues[0]?.message ?? "Check the recipient and message fields.";
  }

  if (error instanceof BroadcastError) {
    return error.code === "BROADCAST_NOT_FOUND"
      ? "No broadcast with that ID exists in this organisation."
      : error.issues[0]?.message ?? "This broadcast cannot be tested.";
  }

  if (error instanceof TemplateError) {
    return (
      error.issues[0]?.message ??
      "Broadcast HTML could not be rendered for this test."
    );
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

export async function sendBroadcastTestEmailAction(
  _previous: BroadcastTestSendState,
  formData: FormData,
): Promise<BroadcastTestSendState> {
  const { organization, session } = await requireOrganization();
  const broadcastId = String(formData.get("broadcastId") ?? "");

  try {
    const message = await queueBroadcastTestEmail(
      {
        actorUserId: session.user.id,
        broadcastId,
        from: formData.get("from"),
        html: formData.get("html"),
        orgId: organization.id,
        subject: formData.get("subject"),
        text: formData.get("text"),
        to: formData.get("to"),
      },
      {
        authorize: requireConsoleSendPermission,
        loadBroadcast: getBroadcast,
        queue: queueEmail,
      },
    );
    revalidatePath("/app/logs");
    return { error: null, queuedId: message.id };
  } catch (error) {
    return { error: testSendErrorMessage(error), queuedId: null };
  }
}
