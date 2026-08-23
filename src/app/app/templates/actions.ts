"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import { TemplateError } from "@/lib/template-core";
import {
  createTemplate,
  deleteTemplate,
  updateTemplate,
} from "@/lib/templates";

function templateErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow that template change.";
  }

  if (error instanceof TemplateError) {
    if (error.code === "TEMPLATE_EXISTS") {
      return "A template with that name already exists in this organization.";
    }

    if (error.code === "VALIDATION_ERROR") {
      return error.issues[0]?.message ?? "Check the template fields.";
    }

    return "That template action is no longer available.";
  }

  throw error;
}

function errorRedirect(error: unknown): never {
  redirect(
    `/app/templates?error=${encodeURIComponent(templateErrorMessage(error))}`,
  );
}

function templatePayload(formData: FormData) {
  const html = String(formData.get("html") ?? "");
  const text = String(formData.get("text") ?? "");

  return {
    html: html.length > 0 ? html : null,
    name: formData.get("name"),
    subject: formData.get("subject"),
    text: text.length > 0 ? text : null,
  };
}

export async function createTemplateAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await createTemplate({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: templatePayload(formData),
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/templates");
  redirect("/app/templates?saved=created");
}

export async function updateTemplateAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await updateTemplate({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: templatePayload(formData),
      templateId: String(formData.get("templateId")),
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/templates");
  redirect("/app/templates?saved=updated");
}

export async function deleteTemplateAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  if (formData.get("confirm") !== "yes") {
    redirect(
      "/app/templates?error=Confirm%20the%20template%20deletion%20first.",
    );
  }

  try {
    await deleteTemplate({
      actorUserId: session.user.id,
      orgId: organization.id,
      templateId: String(formData.get("templateId")),
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/templates");
  redirect("/app/templates?saved=deleted");
}
