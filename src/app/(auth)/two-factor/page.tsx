import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TwoFactorForm } from "@/components/two-factor-form";
import { getSession } from "@/lib/session";

export const metadata: Metadata = {
  title: "Two-factor verification · PaperBoy",
};

export default async function TwoFactorPage() {
  if (await getSession()) redirect("/app");
  return <TwoFactorForm />;
}
