import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, orgs } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";
import { MessageEventError } from "@/lib/message-event-core";
import { recordMessageEvent } from "@/lib/message-events";
import { MessageStatusError } from "@/lib/message-status-core";
import {
  openTrackingPublicUrl,
  OpenTrackingSettingsError,
  parseOpenTrackingSigningKey,
  parseUpdateOpenTrackingInput,
  verifyOpenTrackingSignature,
  type OpenTrackingSettings,
} from "@/lib/open-tracking-core";

async function requireOrganizationPermission(input: {
  actorUserId: string;
  orgId: string;
  permission: OrgPermission;
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
    throw new OpenTrackingSettingsError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, input.permission);
}

export async function getOpenTrackingSettings(input: {
  actorUserId: string;
  orgId: string;
}): Promise<OpenTrackingSettings> {
  await requireOrganizationPermission({
    ...input,
    permission: "openTracking.read",
  });
  const [organization] = await db
    .select({
      enabled: orgs.openTrackingEnabled,
      updatedAt: orgs.updatedAt,
    })
    .from(orgs)
    .where(eq(orgs.id, input.orgId))
    .limit(1);
  if (!organization) {
    throw new OpenTrackingSettingsError("MEMBERSHIP_REQUIRED");
  }
  return organization;
}

export async function updateOpenTrackingSettings(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<OpenTrackingSettings> {
  const changes = parseUpdateOpenTrackingInput(input.payload);
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
      throw new OpenTrackingSettingsError("MEMBERSHIP_REQUIRED");
    }
    requirePermission(membership.role, "openTracking.manage");
    if (changes.enabled) {
      parseOpenTrackingSigningKey();
      openTrackingPublicUrl();
    }

    const [updated] = await tx
      .update(orgs)
      .set({ openTrackingEnabled: changes.enabled, updatedAt: now })
      .where(eq(orgs.id, input.orgId))
      .returning({
        enabled: orgs.openTrackingEnabled,
        updatedAt: orgs.updatedAt,
      });
    if (!updated) throw new OpenTrackingSettingsError("MEMBERSHIP_REQUIRED");
    return updated;
  });
}

export async function recordOpenTrackingHit(input: {
  messageId: string;
  signature: string;
}): Promise<boolean> {
  if (!verifyOpenTrackingSignature(input)) return false;
  try {
    await recordMessageEvent({
      data: {},
      messageId: input.messageId,
      type: "opened",
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
