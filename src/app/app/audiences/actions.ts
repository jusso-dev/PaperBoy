"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AudienceError,
  MAX_CONTACT_CSV_BYTES,
  parseAudienceSearch,
} from "@/lib/audience-core";
import {
  createAudience,
  createContact,
  deleteAudience,
  deleteContact,
  deleteUnsubscribedContacts,
  importContacts,
  updateAudience,
  updateContact,
} from "@/lib/audiences";
import { AuthorizationError } from "@/lib/authorization";
import { requireOrganization } from "@/lib/session";

function message(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow that audience change.";
  }
  if (error instanceof AudienceError) {
    switch (error.code) {
      case "AUDIENCE_EXISTS": return "An audience with that name already exists.";
      case "AUDIENCE_NOT_FOUND": return "That audience is no longer available.";
      case "CONTACT_EXISTS": return "That email address already belongs to this audience.";
      case "CONTACT_NOT_FOUND": return "That contact is no longer available.";
      case "CSV_TOO_LARGE": return "CSV files must not exceed 1 MiB.";
      case "VALIDATION_ERROR": return error.issues[0]?.message ?? "Check the audience input.";
      default: return "That audience action is no longer available.";
    }
  }
  throw error;
}

function destination(audienceId: string | null, values: Record<string, string>) {
  const query = new URLSearchParams(values);
  if (audienceId) query.set("audience", audienceId);
  return `/app/audiences?${query}`;
}

function errorRedirect(error: unknown, audienceId: string | null): never {
  redirect(destination(audienceId, { error: message(error) }));
}

async function context() {
  const { organization, session } = await requireOrganization();
  return { actorUserId: session.user.id, orgId: organization.id };
}

export async function createAudienceAction(formData: FormData) {
  let created: Awaited<ReturnType<typeof createAudience>>;
  try {
    created = await createAudience({
      ...(await context()),
      payload: { name: formData.get("name") },
    });
  } catch (error) {
    errorRedirect(error, null);
  }
  revalidatePath("/app/audiences");
  redirect(destination(created.id, { saved: "audience-created" }));
}

export async function updateAudienceAction(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  try {
    await updateAudience({
      ...(await context()),
      audienceId,
      payload: { name: formData.get("name") },
    });
  } catch (error) { errorRedirect(error, audienceId); }
  revalidatePath("/app/audiences");
  redirect(destination(audienceId, { saved: "audience-updated" }));
}

export async function deleteAudienceAction(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  if (formData.get("confirm") !== "yes") {
    redirect(destination(audienceId, { error: "Confirm audience and contact deletion." }));
  }
  try { await deleteAudience({ ...(await context()), audienceId }); }
  catch (error) { errorRedirect(error, audienceId); }
  revalidatePath("/app/audiences");
  redirect(destination(null, { saved: "audience-deleted" }));
}

export async function createContactAction(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  try {
    await createContact({
      ...(await context()),
      audienceId,
      payload: { email: formData.get("email"), name: formData.get("name") },
    });
  } catch (error) { errorRedirect(error, audienceId); }
  revalidatePath("/app/audiences");
  redirect(destination(audienceId, { saved: "contact-created" }));
}

export async function updateContactAction(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  try {
    await updateContact({
      ...(await context()),
      audienceId,
      contactId: String(formData.get("contactId") ?? ""),
      payload: { email: formData.get("email"), name: formData.get("name") },
    });
  } catch (error) { errorRedirect(error, audienceId); }
  revalidatePath("/app/audiences");
  redirect(destination(audienceId, { saved: "contact-updated" }));
}

export async function deleteContactAction(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  if (formData.get("confirm") !== "yes") {
    redirect(destination(audienceId, { error: "Confirm contact deletion." }));
  }
  try {
    await deleteContact({
      ...(await context()),
      audienceId,
      contactId: String(formData.get("contactId") ?? ""),
    });
  } catch (error) { errorRedirect(error, audienceId); }
  revalidatePath("/app/audiences");
  redirect(destination(audienceId, { saved: "contact-deleted" }));
}

export async function deleteUnsubscribedContactsAction(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  if (formData.get("confirm") !== "yes") {
    redirect(destination(audienceId, { error: "Confirm unsubscribed contact deletion." }));
  }
  // This removes every unsubscribed contact in the audience, never only the rows
  // a search happens to show, so it is refused outright while one is active.
  // The console also disables the control; this is the authoritative check.
  const activeSearch = parseAudienceSearch(formData.get("contactQuery"));
  if (activeSearch) {
    redirect(
      destination(audienceId, {
        contactQuery: activeSearch,
        error:
          "Clear the contact search before deleting unsubscribed contacts. This removes every unsubscribed contact in the audience, not only the rows shown.",
      }),
    );
  }
  let result: Awaited<ReturnType<typeof deleteUnsubscribedContacts>>;
  try {
    result = await deleteUnsubscribedContacts({ ...(await context()), audienceId });
  } catch (error) { errorRedirect(error, audienceId); }
  revalidatePath("/app/audiences");
  redirect(
    destination(audienceId, {
      deleted: String(result.deleted),
      saved: "unsubscribed-deleted",
    }),
  );
}

export async function importContactsAction(formData: FormData) {
  const audienceId = String(formData.get("audienceId") ?? "");
  const upload = formData.get("csv");
  let result: Awaited<ReturnType<typeof importContacts>>;
  try {
    if (!(upload instanceof File) || upload.size === 0) {
      throw new AudienceError("VALIDATION_ERROR", [
        { field: "csv", message: "Choose a non-empty CSV file." },
      ]);
    }
    if (upload.size > MAX_CONTACT_CSV_BYTES) throw new AudienceError("CSV_TOO_LARGE");
    let csv: string;
    try {
      csv = new TextDecoder("utf-8", { fatal: true }).decode(await upload.arrayBuffer());
    } catch {
      throw new AudienceError("VALIDATION_ERROR", [
        { field: "csv", message: "CSV files must be valid UTF-8 text." },
      ]);
    }
    result = await importContacts({ ...(await context()), audienceId, csv });
  } catch (error) { errorRedirect(error, audienceId); }
  revalidatePath("/app/audiences");
  redirect(
    destination(audienceId, {
      created: String(result.created),
      saved: "contacts-imported",
      unchanged: String(result.unchanged),
      updated: String(result.updated),
    }),
  );
}
