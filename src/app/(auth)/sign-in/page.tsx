import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sign in · PaperBoy",
};

export default async function SignInPage() {
  if (await getSession()) {
    redirect("/app");
  }

  return <AuthForm mode="sign-in" />;
}
