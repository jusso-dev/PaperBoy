"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { AudienceError } from "@/lib/audience-core";
import { BroadcastError } from "@/lib/broadcast-core";
import {
  cancelBroadcast,
  createBroadcast,
  pauseBroadcast,
  resumeBroadcast,
} from "@/lib/broadcasts";
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
