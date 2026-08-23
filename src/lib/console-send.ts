import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
} from "@/lib/authorization";
import { DomainError, getDomain } from "@/lib/domains";
import { queueEmail, type QueuedMessageRecord } from "@/lib/messages";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireConsoleSendPermission(input: {
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
  domainId: unknown;
  html: unknown;
  orgId: string;
  subject: unknown;
  text: unknown;
  to: unknown;
}): Promise<QueuedMessageRecord> {
  await requireConsoleSendPermission(input);

  if (typeof input.domainId !== "string" || !UUID_PATTERN.test(input.domainId)) {
    throw new DomainError("DOMAIN_NOT_FOUND");
  }

  const domain = await getDomain({
    actorUserId: input.actorUserId,
    domainId: input.domainId,
    orgId: input.orgId,
  });
  const ready =
    domain.status === "verified" &&
    domain.dkimKeys.some((key) => key.status === "active");

  if (!ready) {
    throw new DomainError("DOMAIN_NOT_VERIFIED");
  }

  return queueEmail({
    payload: {
      from: `PaperBoy <test@${domain.name}>`,
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
