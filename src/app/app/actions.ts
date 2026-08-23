"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireSession } from "@/lib/session";

export async function signOutAction() {
  await requireSession();

  await auth.api.signOut({
    headers: await headers(),
  });

  redirect("/sign-in");
}
