import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  ensureDefaultOrganization,
  getActiveOrganizationContext,
} from "@/lib/organizations";

export const getSession = cache(async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return null;
  }

  const organizationIds = await ensureDefaultOrganization(session.user);

  return {
    ...session,
    user: {
      ...session.user,
      ...organizationIds,
    },
  };
});

export async function requireSession() {
  const session = await getSession();

  if (!session) {
    redirect("/sign-in");
  }

  return session;
}

export async function requireOrganization() {
  const session = await requireSession();
  const organization = await cachedOrganizationContext(session.user.id);

  return { organization, session };
}

const cachedOrganizationContext = cache(getActiveOrganizationContext);
