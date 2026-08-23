"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { DkimError } from "@/lib/dkim-core";
import {
  finalizeDomainDkimRotation,
  rotateDomainDkim,
  setupDomainDkim,
} from "@/lib/dkim";
import {
  DomainError,
  createDomain,
  deleteDomain,
  verifyDomain,
} from "@/lib/domains";
import { requireOrganization } from "@/lib/session";

function domainErrorMessage(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "Your role does not allow that domain change.";
  }

  if (error instanceof DomainError) {
    if (error.code === "INVALID_DOMAIN") {
      return "Enter a hostname such as mail.example.com, without a URL or wildcard.";
    }

    if (error.code === "DOMAIN_EXISTS") {
      return "That domain is already in this organization.";
    }

    if (error.code === "DNS_CONFIGURATION_INVALID") {
      return "The operator must correct PAPERBOY_SPF_RECORD before domains can be checked.";
    }

    return "That domain action is no longer available.";
  }

  if (error instanceof DkimError) {
    if (error.code === "CONFIGURATION_INVALID") {
      return "The operator must set a valid PAPERBOY_DKIM_ENCRYPTION_KEY before managing DKIM.";
    }

    if (error.code === "KEY_NOT_ACTIVE") {
      return "Verify the current DKIM selector before rotating it.";
    }

    if (error.code === "ROTATION_PENDING") {
      return "Finish the current DKIM rotation before starting another.";
    }

    if (error.code === "ROTATION_NOT_READY") {
      return "Publish and verify the new selector before finalising rotation.";
    }

    return "That DKIM action could not be completed.";
  }

  throw error;
}

function errorRedirect(error: unknown): never {
  redirect(`/app/domains?error=${encodeURIComponent(domainErrorMessage(error))}`);
}

export async function createDomainAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await createDomain({
      actorUserId: session.user.id,
      name: formData.get("name"),
      orgId: organization.id,
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/domains");
  redirect("/app/domains?saved=created");
}

export async function verifyDomainAction(formData: FormData) {
  const { organization, session } = await requireOrganization();
  let verified = false;

  try {
    const result = await verifyDomain({
      actorUserId: session.user.id,
      domainId: String(formData.get("domainId")),
      orgId: organization.id,
    });
    verified = result.domain.status === "verified";
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/domains");
  redirect(`/app/domains?saved=${verified ? "verified" : "checked"}`);
}

export async function deleteDomainAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await deleteDomain({
      actorUserId: session.user.id,
      domainId: String(formData.get("domainId")),
      orgId: organization.id,
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/domains");
  redirect("/app/domains?saved=deleted");
}

export async function setupDkimAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await setupDomainDkim({
      actorUserId: session.user.id,
      domainId: String(formData.get("domainId")),
      orgId: organization.id,
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/domains");
  redirect("/app/domains?saved=dkim-ready");
}

export async function rotateDkimAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await rotateDomainDkim({
      actorUserId: session.user.id,
      domainId: String(formData.get("domainId")),
      orgId: organization.id,
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/domains");
  redirect("/app/domains?saved=rotation-started");
}

export async function finalizeDkimRotationAction(formData: FormData) {
  const { organization, session } = await requireOrganization();

  try {
    await finalizeDomainDkimRotation({
      actorUserId: session.user.id,
      domainId: String(formData.get("domainId")),
      orgId: organization.id,
    });
  } catch (error) {
    errorRedirect(error);
  }

  revalidatePath("/app/domains");
  redirect("/app/domains?saved=rotation-finalised");
}
