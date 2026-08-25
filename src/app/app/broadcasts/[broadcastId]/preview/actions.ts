"use server";

import { AuthorizationError } from "@/lib/authorization";
import { BroadcastError } from "@/lib/broadcast-core";
import { getBroadcast } from "@/lib/broadcasts";
import { requireOrganization } from "@/lib/session";
import { previewTemplate, TemplateError } from "@/lib/template-core";
import type { TemplatePreviewState } from "@/lib/template-preview-state";

function previewErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow broadcast previews.";
  }

  if (error instanceof BroadcastError) {
    return error.code === "BROADCAST_NOT_FOUND"
      ? "That broadcast is no longer available."
      : "Your role does not allow broadcast previews.";
  }

  if (error instanceof TemplateError) {
    return error.issues[0]?.message ?? "Check the sample JSON.";
  }

  throw error;
}

export async function previewBroadcastAction(
  broadcastId: string,
  previousState: TemplatePreviewState,
  formData: FormData,
): Promise<TemplatePreviewState> {
  const rawData = formData.get("data");

  if (typeof rawData !== "string") {
    return { ...previousState, error: "Provide sample JSON data." };
  }

  let data: unknown;

  try {
    data = JSON.parse(rawData);
  } catch {
    return { ...previousState, error: "Sample data must be valid JSON." };
  }

  const { organization, session } = await requireOrganization();

  try {
    const broadcast = await getBroadcast({
      actorUserId: session.user.id,
      broadcastId,
      orgId: organization.id,
    });
    const preview = previewTemplate(
      {
        html: broadcast.templateHtml,
        requiredVariables: broadcast.templateRequiredVariables,
        subject: broadcast.templateSubject,
        text: broadcast.templateText,
      },
      data,
    );

    return { ...preview, error: null };
  } catch (error) {
    return { ...previousState, error: previewErrorMessage(error) };
  }
}
