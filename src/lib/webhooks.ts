import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { orgMembers, orgs, webhookEndpoints } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";
import {
  WebhookError,
  configuredWebhookEncryptionKey,
  createWebhookSigningSecret,
  encryptWebhookSigningSecret,
  parseWebhookConfigurationInput,
} from "@/lib/webhook-core";

export type WebhookEndpointRecord = {
  createdAt: Date;
  id: string;
  updatedAt: Date;
  url: string;
};

export type WebhookConfigurationResult = {
  endpoint: WebhookEndpointRecord;
  signingSecret: string | null;
};

async function requireWebhookPermission(input: {
  actorUserId: string | null;
  orgId: string;
  permission: OrgPermission;
}): Promise<void> {
  if (!input.actorUserId) {
    throw new WebhookError("MEMBERSHIP_REQUIRED");
  }

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
    throw new WebhookError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, input.permission);
}

function endpointFromRow(
  row: typeof webhookEndpoints.$inferSelect,
): WebhookEndpointRecord {
  return {
    createdAt: row.createdAt,
    id: row.id,
    updatedAt: row.updatedAt,
    url: row.url,
  };
}

export async function getWebhookEndpoint(input: {
  actorUserId: string | null;
  orgId: string;
}): Promise<WebhookEndpointRecord | null> {
  await requireWebhookPermission({ ...input, permission: "webhooks.read" });
  const [endpoint] = await db
    .select()
    .from(webhookEndpoints)
    .where(eq(webhookEndpoints.orgId, input.orgId))
    .limit(1);
  return endpoint ? endpointFromRow(endpoint) : null;
}

export async function configureWebhookEndpoint(input: {
  actorUserId: string | null;
  allowInsecureLoopback?: boolean;
  encryptionKey?: Buffer;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<WebhookConfigurationResult> {
  const actorUserId = input.actorUserId;

  if (!actorUserId) {
    throw new WebhookError("MEMBERSHIP_REQUIRED");
  }

  return db.transaction(async (tx) => {
    await tx
      .select({ id: orgs.id })
      .from(orgs)
      .where(eq(orgs.id, input.orgId))
      .for("update");
    const [membership] = await tx
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, input.orgId),
          eq(orgMembers.userId, actorUserId),
        ),
      )
      .limit(1);

    if (!membership || !isOrgRole(membership.role)) {
      throw new WebhookError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(membership.role, "webhooks.manage");
    const { url } = parseWebhookConfigurationInput(input.payload, {
      allowInsecureLoopback:
        input.allowInsecureLoopback ?? process.env.NODE_ENV !== "production",
    });
    const now = input.now ?? new Date();
    const [existing] = await tx
      .select()
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.orgId, input.orgId))
      .limit(1);

    if (existing) {
      const [updated] = await tx
        .update(webhookEndpoints)
        .set({ updatedAt: now, url })
        .where(eq(webhookEndpoints.id, existing.id))
        .returning();

      if (!updated) {
        throw new Error("Webhook endpoint update returned no row.");
      }

      return { endpoint: endpointFromRow(updated), signingSecret: null };
    }

    const id = randomUUID();
    const signingSecret = createWebhookSigningSecret();
    const encryptedSecret = encryptWebhookSigningSecret({
      context: { endpointId: id, orgId: input.orgId },
      encryptionKey:
        input.encryptionKey ?? configuredWebhookEncryptionKey(),
      secret: signingSecret,
    });
    const [created] = await tx
      .insert(webhookEndpoints)
      .values({
        createdAt: now,
        createdByUserId: actorUserId,
        encryptedSecret,
        id,
        orgId: input.orgId,
        updatedAt: now,
        url,
      })
      .returning();

    if (!created) {
      throw new Error("Webhook endpoint insert returned no row.");
    }

    return { endpoint: endpointFromRow(created), signingSecret };
  });
}
