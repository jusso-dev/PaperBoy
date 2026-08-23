"use server";

import { AuthorizationError } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import { TemplateError } from "@/lib/template-core";
import { previewStoredTemplate } from "@/lib/templates";

export type TemplatePreviewState = {
  error: string | null;
  html: string | null;
  missingVariables: string[];
  subject: string;
  text: string | null;
};

function previewErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow template previews.";
  }

  if (error instanceof TemplateError) {
    if (error.code === "TEMPLATE_NOT_FOUND") {
      return "That template is no longer available.";
    }

    return error.issues[0]?.message ?? "Check the sample JSON.";
  }

  throw error;
}

export async function previewTemplateAction(
  templateId: string,
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
    const preview = await previewStoredTemplate({
      actorUserId: session.user.id,
      data,
      orgId: organization.id,
      templateId,
    });

    return { ...preview, error: null };
  } catch (error) {
    return { ...previousState, error: previewErrorMessage(error) };
  }
}
