"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";
import {
  MAX_SUPPRESSION_CSV_BYTES,
  SuppressionError,
} from "@/lib/suppression-core";
import {
  createSuppression,
  deleteSuppression,
  importSuppressions,
  updateSuppression,
} from "@/lib/suppressions";

function suppressionErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow that suppression change.";
  }

  if (error instanceof SuppressionError) {
    switch (error.code) {
      case "SUPPRESSION_EXISTS":
        return "That email address is already suppressed in this organization.";
      case "CSV_TOO_LARGE":
        return "CSV files must not exceed 1 MiB.";
      case "CSV_TOO_MANY_ROWS":
        return "CSV files must not exceed 5,000 data rows.";
      case "VALIDATION_ERROR":
        return error.issues[0]?.message ?? "Check the suppression input.";
      default:
        return "That suppression action is no longer available.";
    }
  }

  throw error;
}

function errorRedirect(error: unknown): never {
  redirect(
    `/app/suppressions?error=${encodeURIComponent(
      suppressionErrorMessage(error),
    )}`,
  );
}

function suppressionPayload(formData: FormData) {
  return {
    email: formData.get("email"),
    reason: formData.get("reason"),
  };
}

export async function createSuppressionAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await createSuppression({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: suppressionPayload(formData),
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/suppressions");
  redirect("/app/suppressions?saved=created");
}

export async function updateSuppressionAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await updateSuppression({
      actorUserId: session.user.id,
      orgId: organization.id,
      payload: suppressionPayload(formData),
      suppressionId: String(formData.get("suppressionId")),
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/suppressions");
  redirect("/app/suppressions?saved=updated");
}

export async function deleteSuppressionAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  if (formData.get("confirm") !== "yes") {
    redirect(
      "/app/suppressions?error=Confirm%20that%20this%20address%20may%20receive%20future%20mail.",
    );
  }

  try {
    await deleteSuppression({
      actorUserId: session.user.id,
      orgId: organization.id,
      suppressionId: String(formData.get("suppressionId")),
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/suppressions");
  redirect("/app/suppressions?saved=deleted");
}

export async function importSuppressionsAction(formData: FormData) {
  const { organization, session } = await requireOrganization();
  const upload = formData.get("csv");
  let result: Awaited<ReturnType<typeof importSuppressions>>;

  try {
    if (!(upload instanceof File) || upload.size === 0) {
      throw new SuppressionError("VALIDATION_ERROR", [
        { field: "csv", message: "Choose a non-empty CSV file." },
      ]);
    }

    if (upload.size > MAX_SUPPRESSION_CSV_BYTES) {
      throw new SuppressionError("CSV_TOO_LARGE");
    }

    let csv: string;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(
        await upload.arrayBuffer(),
      );
    } catch {
      throw new SuppressionError("VALIDATION_ERROR", [
        { field: "csv", message: "CSV files must be valid UTF-8 text." },
      ]);
    }

    result = await importSuppressions({
      actorUserId: session.user.id,
      csv,
      orgId: organization.id,
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/suppressions");
  redirect(
    `/app/suppressions?saved=imported&created=${result.created}&updated=${result.updated}&unchanged=${result.unchanged}`,
  );
}
