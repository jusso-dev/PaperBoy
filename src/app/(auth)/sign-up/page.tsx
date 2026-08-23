import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Create account · PaperBoy",
};

export default async function SignUpPage() {
  if (await getSession()) {
    redirect("/app");
  }

  return <AuthForm mode="sign-up" />;
}
