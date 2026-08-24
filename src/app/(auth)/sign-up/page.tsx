import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";
import { publicSignUpEnabled } from "@/lib/signup-policy";

export const metadata: Metadata = {
  title: "Create account · PaperBoy",
};

export default async function SignUpPage() {
  if (await getSession()) {
    redirect("/app");
  }

  if (!publicSignUpEnabled()) {
    redirect("/sign-in");
  }

  return <AuthForm mode="sign-up" />;
}
