"use server";

import { redirect } from "next/navigation";
import { unsubscribe, UnsubscribeError } from "@/lib/unsubscribe";
import { UnsubscribeConfigurationError } from "@/lib/unsubscribe-core";

export async function unsubscribeAction(formData: FormData) {
  const token = formData.get("token");

  try {
    if (typeof token !== "string") throw new UnsubscribeError();
    await unsubscribe({ token });
  } catch (error) {
    if (
      error instanceof UnsubscribeError ||
      error instanceof UnsubscribeConfigurationError
    ) {
      redirect("/unsubscribe?status=invalid");
    }
    throw error;
  }

  redirect("/unsubscribe?status=done");
}
