import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";
import { publicSignUpEnabled } from "@/lib/signup-policy";

export const metadata: Metadata = {
  title: "Sign in · PaperBoy",
};

export default async function SignInPage() {
  if (await getSession()) {
    redirect("/app");
  }

  return (
    <AuthForm allowSignUp={publicSignUpEnabled()} mode="sign-in" />
  );
}
