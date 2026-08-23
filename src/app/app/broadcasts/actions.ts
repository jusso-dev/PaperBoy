"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { AuthorizationError } from "@/lib/authorization";
import { BroadcastError } from "@/lib/broadcast-core";
import {
  cancelBroadcast,
  pauseBroadcast,
  resumeBroadcast,
} from "@/lib/broadcasts";
import { requireOrganization } from "@/lib/session";

function errorCode(error: unknown): string {
  if (error instanceof AuthorizationError) {
    return "forbidden";
  }

  if (error instanceof BroadcastError) {
    if (error.code === "BROADCAST_NOT_FOUND") {
      return "not-found";
    }

    if (error.code === "INVALID_TRANSITION") {
      return "invalid-transition";
    }

    return "forbidden";
  }

  throw error;
}

async function control(
  broadcastId: string,
  operation: "cancel" | "pause" | "resume",
): Promise<never> {
  const { organization, session } = await requireOrganization();
  const input = {
    actorUserId: session.user.id,
    broadcastId,
    orgId: organization.id,
  };

  try {
    if (operation === "cancel") {
      await cancelBroadcast(input);
    } else if (operation === "pause") {
      await pauseBroadcast(input);
    } else {
      await resumeBroadcast(input);
    }
  } catch (error) {
    redirect(`/app/broadcasts?error=${errorCode(error)}`);
  }

  revalidatePath("/app/broadcasts");
  redirect(`/app/broadcasts?success=${operation}`);
}

export async function pauseBroadcastAction(formData: FormData) {
  return control(String(formData.get("broadcastId") ?? ""), "pause");
}

export async function resumeBroadcastAction(formData: FormData) {
  return control(String(formData.get("broadcastId") ?? ""), "resume");
}

export async function cancelBroadcastAction(formData: FormData) {
  return control(String(formData.get("broadcastId") ?? ""), "cancel");
}
