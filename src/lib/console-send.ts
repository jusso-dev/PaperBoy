import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
} from "@/lib/authorization";
import { DomainError } from "@/lib/domains";
import { queueEmail, type QueuedMessageRecord } from "@/lib/messages";

export async function requireConsoleSendPermission(input: {
  actorUserId: string;
  orgId: string;
}): Promise<void> {
  const [membership] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(
      and(
        eq(orgMembers.orgId, input.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .limit(1);

  if (!membership || !isOrgRole(membership.role)) {
    throw new DomainError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, "messages.send");
}

export async function queueConsoleTestEmail(input: {
  actorUserId: string;
  fromDomain: unknown;
  html: unknown;
  orgId: string;
  subject: unknown;
  text: unknown;
  to: unknown;
}): Promise<QueuedMessageRecord> {
  await requireConsoleSendPermission(input);

  if (typeof input.fromDomain !== "string" || input.fromDomain.length === 0) {
    throw new DomainError("INVALID_DOMAIN");
  }

  return queueEmail({
    payload: {
      from: `PaperBoy <test@${input.fromDomain}>`,
      html: input.html,
      subject: input.subject,
      text: input.text,
      to: input.to,
    },
    principal: {
      actorUserId: input.actorUserId,
      apiKeyId: null,
      environment: "live",
      orgId: input.orgId,
    },
  });
}
