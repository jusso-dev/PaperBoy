"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ApiKeyError, createApiKey, revokeApiKey } from "@/lib/api-keys";
import { AuthorizationError } from "@/lib/authorization";
import { requireOrganization, requireSession } from "@/lib/session";

export type CreateApiKeyState = {
  display: string | null;
  error: string | null;
  rawKey: string | null;
};

function apiKeyErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow API key changes.";
  }

  if (error instanceof ApiKeyError) {
    if (error.code === "INVALID_NAME") {
      return "Enter a key name between 1 and 80 characters.";
    }

    return "That API key action is no longer available.";
  }

  throw error;
}

export async function createApiKeyAction(
  _previousState: CreateApiKeyState,
  formData: FormData,
): Promise<CreateApiKeyState> {
  const { organization, session } = await requireOrganization();

  try {
    const key = await createApiKey({
      actorUserId: session.user.id,
      environment: "live",
      name: formData.get("name"),
      orgId: organization.id,
    });

    revalidatePath("/app/api-keys");

    return {
      display: key.display,
      error: null,
      rawKey: key.rawKey,
    };
  } catch (error) {
    return {
      display: null,
      error: apiKeyErrorMessage(error),
      rawKey: null,
    };
  }
}

export async function revokeApiKeyAction(formData: FormData) {
  const session = await requireSession();

  try {
    await revokeApiKey({
      actorUserId: session.user.id,
      apiKeyId: String(formData.get("apiKeyId")),
    });
  } catch (error) {
    redirect(
      `/app/api-keys?error=${encodeURIComponent(apiKeyErrorMessage(error))}`,
    );
  }

  revalidatePath("/app/api-keys");
  redirect("/app/api-keys?saved=revoked");
}
