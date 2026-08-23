import { and, eq, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  orgMembers,
  orgs,
  sendRateLimitWindows,
} from "@/db/schema";
import type { ApiKeyEnvironment } from "@/lib/api-key-crypto";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";
import {
  configuredRateLimitDefaults,
  effectiveRateLimits,
  parseUpdateRateLimitInput,
  RateLimitConfigurationError,
  RateLimitError,
  RateLimitSettingsError,
  type RateLimitSettings,
} from "@/lib/rate-limit-core";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RateLimitReceipt = {
  acceptedCount: number;
  limit: number;
  remaining: number;
  resetAt: Date;
};

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
    throw new RateLimitSettingsError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, input.permission);
}

function settingsFromRow(row: {
  liveRateLimitPerMinute: number | null;
  testRateLimitPerMinute: number | null;
  updatedAt: Date;
}): RateLimitSettings {
  const defaults = configuredRateLimitDefaults();
  const effective = effectiveRateLimits({
    defaults,
    liveOverride: row.liveRateLimitPerMinute,
    testOverride: row.testRateLimitPerMinute,
  });
  return {
    defaultLiveLimitPerMinute: defaults.live,
    defaultTestLimitPerMinute: defaults.test,
    liveLimitPerMinute: effective.live,
    liveOverridePerMinute: row.liveRateLimitPerMinute,
    testLimitPerMinute: effective.test,
    testOverridePerMinute: row.testRateLimitPerMinute,
    updatedAt: row.updatedAt,
  };
}

export async function getRateLimitSettings(input: {
  actorUserId: string;
  orgId: string;
}): Promise<RateLimitSettings> {
  await requireOrganizationPermission({
    ...input,
    permission: "rateLimits.read",
  });
  const [organization] = await db
    .select({
      liveRateLimitPerMinute: orgs.liveRateLimitPerMinute,
      testRateLimitPerMinute: orgs.testRateLimitPerMinute,
      updatedAt: orgs.updatedAt,
    })
    .from(orgs)
    .where(eq(orgs.id, input.orgId))
    .limit(1);
  if (!organization) throw new RateLimitSettingsError("MEMBERSHIP_REQUIRED");
  return settingsFromRow(organization);
}

export async function updateRateLimitSettings(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<RateLimitSettings> {
  const changes = parseUpdateRateLimitInput(input.payload);
  const defaults = configuredRateLimitDefaults();
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
      throw new RateLimitSettingsError("MEMBERSHIP_REQUIRED");
    }
    requirePermission(membership.role, "rateLimits.manage");

    const [organization] = await tx
      .select({
        liveRateLimitPerMinute: orgs.liveRateLimitPerMinute,
        testRateLimitPerMinute: orgs.testRateLimitPerMinute,
      })
      .from(orgs)
      .where(eq(orgs.id, input.orgId))
      .for("update");
    if (!organization) throw new RateLimitSettingsError("MEMBERSHIP_REQUIRED");

    const liveOverride =
      changes.liveLimitPerMinute === undefined
        ? organization.liveRateLimitPerMinute
        : changes.liveLimitPerMinute;
    const testOverride =
      changes.testLimitPerMinute === undefined
        ? organization.testRateLimitPerMinute
        : changes.testLimitPerMinute;
    const live = liveOverride ?? defaults.live;
    const test = testOverride ?? defaults.test;
    if (test <= live) {
      throw new RateLimitSettingsError("VALIDATION_ERROR", [
        {
          field: "test_limit_per_minute",
          message: "The effective test limit must be higher than the effective live limit.",
        },
      ]);
    }

    const [updated] = await tx
      .update(orgs)
      .set({
        liveRateLimitPerMinute: liveOverride,
        testRateLimitPerMinute: testOverride,
        updatedAt: now,
      })
      .where(eq(orgs.id, input.orgId))
      .returning({
        liveRateLimitPerMinute: orgs.liveRateLimitPerMinute,
        testRateLimitPerMinute: orgs.testRateLimitPerMinute,
        updatedAt: orgs.updatedAt,
      });
    if (!updated) throw new RateLimitSettingsError("MEMBERSHIP_REQUIRED");
    return settingsFromRow(updated);
  });
}

export async function consumeSendRateLimit(input: {
  environment: ApiKeyEnvironment;
  now?: Date;
  orgId: string;
  tx: Transaction;
}): Promise<RateLimitReceipt> {
  const [organization] = await input.tx
    .select({
      databaseNow: sql<Date | string>`transaction_timestamp()`,
      liveRateLimitPerMinute: orgs.liveRateLimitPerMinute,
      testRateLimitPerMinute: orgs.testRateLimitPerMinute,
    })
    .from(orgs)
    .where(eq(orgs.id, input.orgId))
    .for("share");
  if (!organization) throw new RateLimitConfigurationError();

  const limits = effectiveRateLimits({
    liveOverride: organization.liveRateLimitPerMinute,
    testOverride: organization.testRateLimitPerMinute,
  });
  const limit = limits[input.environment];
  const databaseNow = organization.databaseNow;
  const now =
    input.now ??
    (databaseNow instanceof Date ? databaseNow : new Date(databaseNow));
  if (Number.isNaN(now.getTime())) throw new RateLimitConfigurationError();
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / 60_000) * 60_000,
  );
  const resetAt = new Date(windowStartedAt.getTime() + 60_000);

  const [counter] = await input.tx
    .insert(sendRateLimitWindows)
    .values({
      acceptedCount: 1,
      environment: input.environment,
      orgId: input.orgId,
      updatedAt: now,
      windowStartedAt,
    })
    .onConflictDoUpdate({
      set: {
        acceptedCount: sql`case
          when ${sendRateLimitWindows.windowStartedAt} = ${windowStartedAt}
            then ${sendRateLimitWindows.acceptedCount} + 1
          else 1
        end`,
        updatedAt: now,
        windowStartedAt,
      },
      setWhere: or(
        lt(sendRateLimitWindows.windowStartedAt, windowStartedAt),
        and(
          eq(sendRateLimitWindows.windowStartedAt, windowStartedAt),
          lt(sendRateLimitWindows.acceptedCount, limit),
        ),
      ),
      target: [
        sendRateLimitWindows.orgId,
        sendRateLimitWindows.environment,
      ],
    })
    .returning({ acceptedCount: sendRateLimitWindows.acceptedCount });

  if (!counter) {
    throw new RateLimitError(
      input.environment,
      limit,
      Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1_000)),
    );
  }
  return {
    acceptedCount: counter.acceptedCount,
    limit,
    remaining: Math.max(0, limit - counter.acceptedCount),
    resetAt,
  };
}
