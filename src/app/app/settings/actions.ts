"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/session";
import { canonicalTimeZone } from "@/lib/time";

export async function updateTimeZoneAction(formData: FormData) {
  await requireSession();

  const timezone = canonicalTimeZone(formData.get("timezone"));

  if (!timezone) {
    redirect("/app/settings?error=invalid-timezone");
  }

  await auth.api.updateUser({
    body: { timezone },
    headers: await headers(),
  });

  redirect("/app/settings?saved=timezone");
}
