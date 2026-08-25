import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { safeAuthCallbackPath } from "@/lib/organization-invite-access";
import { getSession } from "@/lib/session";
import { publicSignUpEnabled } from "@/lib/signup-policy";

export const metadata: Metadata = {
  title: "Sign in · PaperBoy",
};

type SignInPageProps = {
  searchParams: Promise<{ callbackURL?: string }>;
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const next = safeAuthCallbackPath((await searchParams).callbackURL);
  if (await getSession()) {
    redirect(next);
  }

  return (
    <AuthForm
      allowSignUp={publicSignUpEnabled()}
      callbackURL={next}
      mode="sign-in"
    />
  );
}
