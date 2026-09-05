import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { domains, orgMembers } from "@/db/schema";
import {
  ClickTrackingError,
  parseTrackingSubdomain,
  parseUpdateDomainClickTrackingInput,
} from "@/lib/click-tracking-core";
import { isOrgRole, requirePermission } from "@/lib/authorization";
import { MessageEventError } from "@/lib/message-event-core";
import { recordMessageEvent } from "@/lib/message-events";
import { MessageStatusError } from "@/lib/message-status-core";

export type DomainClickTrackingSettings = {
  enabled: boolean;
  trackingSubdomain: string | null;
  updatedAt: Date;
};

async function requireDomainPermission(input: {
  actorUserId: string;
  orgId: string;
  permission: "domains.read" | "domains.verify";
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
    throw new ClickTrackingError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, input.permission);
}

export async function getDomainClickTracking(input: {
  actorUserId: string;
  domainId: string;
  orgId: string;
}): Promise<DomainClickTrackingSettings> {
  await requireDomainPermission({ ...input, permission: "domains.read" });
  const [row] = await db
    .select({
      enabled: domains.clickTrackingEnabled,
      trackingSubdomain: domains.clickTrackingSubdomain,
      updatedAt: domains.updatedAt,
    })
    .from(domains)
    .where(and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)))
    .limit(1);
  if (!row) throw new ClickTrackingError("NOT_FOUND");
  return {
    enabled: row.enabled ?? false,
    trackingSubdomain: row.trackingSubdomain,
    updatedAt: row.updatedAt,
  };
}

export async function updateDomainClickTracking(input: {
  actorUserId: string;
  domainId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<DomainClickTrackingSettings> {
  const changes = parseUpdateDomainClickTrackingInput(input.payload);
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [membership] = await tx
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, input.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .for("share");
    if (!membership || !isOrgRole(membership.role)) {
      throw new ClickTrackingError("MEMBERSHIP_REQUIRED");
    }
    requirePermission(membership.role, "domains.verify");
    // Normalise once more inside the transaction boundary.
    const trackingSubdomain =
      changes.trackingSubdomain === null
        ? null
        : parseTrackingSubdomain(changes.trackingSubdomain);
    const [updated] = await tx
      .update(domains)
      .set({
        clickTrackingEnabled: changes.enabled,
        clickTrackingSubdomain: trackingSubdomain,
        updatedAt: now,
      })
      .where(
        and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)),
      )
      .returning({
        enabled: domains.clickTrackingEnabled,
        trackingSubdomain: domains.clickTrackingSubdomain,
        updatedAt: domains.updatedAt,
      });
    if (!updated) throw new ClickTrackingError("NOT_FOUND");
    return {
      enabled: updated.enabled ?? false,
      trackingSubdomain: updated.trackingSubdomain,
      updatedAt: updated.updatedAt,
    };
  });
}

export async function recordClickTrackingHit(input: {
  messageId: string;
  signature: string;
  targetUrl: string;
}): Promise<boolean> {
  const { verifyClickTrackingSignature } = await import(
    "@/lib/click-tracking-core"
  );
  if (
    !verifyClickTrackingSignature({
      messageId: input.messageId,
      signature: input.signature,
      targetUrl: input.targetUrl,
    })
  ) {
    return false;
  }
  try {
    await recordMessageEvent({
      data: {},
      messageId: input.messageId,
      type: "clicked",
    });
    return true;
  } catch (error) {
    if (
      error instanceof MessageStatusError ||
      error instanceof MessageEventError
    ) {
      return false;
    }
    throw error;
  }
}
