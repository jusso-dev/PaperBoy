import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { emailSuppressions, orgMembers, orgs } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";
import {
  parseCreateSuppressionInput,
  parseSuppressionCsv,
  parseSuppressionListInput,
  parseUpdateSuppressionInput,
  SuppressionError,
  type SuppressionListInput,
  type SuppressionReason,
  type SuppressionRecord,
} from "@/lib/suppression-core";

const SUPPRESSION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const suppressionSelection = {
  createdAt: emailSuppressions.createdAt,
  email: emailSuppressions.email,
  id: emailSuppressions.id,
  reason: emailSuppressions.reason,
  updatedAt: emailSuppressions.updatedAt,
};

export type SuppressionImportResult = {
  created: number;
  importedAt: Date;
  inputRows: number;
  unchanged: number;
  uniqueRows: number;
  updated: number;
};

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

function requireSuppressionId(suppressionId: string): void {
  if (!SUPPRESSION_ID_PATTERN.test(suppressionId)) {
    throw new SuppressionError("SUPPRESSION_NOT_FOUND");
  }
}

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
    throw new SuppressionError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, input.permission);
}

function searchPattern(query: string): string {
  return `%${query.replace(/[\\%_]/g, "\\$&")}%`;
}

function reasonRank(reason: SuppressionReason): number {
  return reason === "complained"
    ? 3
    : reason === "bounced"
      ? 2
      : reason === "unsubscribed"
        ? 1
        : 0;
}

export async function listSuppressions(input: {
  actorUserId: string;
  filter?: {
    limit?: unknown;
    query?: unknown;
    reason?: unknown;
  };
  orgId: string;
}): Promise<SuppressionRecord[]> {
  await requireOrganizationPermission({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
    permission: "suppressions.read",
  });
  const filter = parseSuppressionListInput(input.filter);
  const conditions = [eq(emailSuppressions.orgId, input.orgId)];

  if (filter.reason) {
    conditions.push(eq(emailSuppressions.reason, filter.reason));
  }

  if (filter.query) {
    conditions.push(
      sql`${emailSuppressions.email} ilike ${searchPattern(filter.query)} escape '\\'`,
    );
  }

  return db
    .select(suppressionSelection)
    .from(emailSuppressions)
    .where(and(...conditions))
    .orderBy(desc(emailSuppressions.updatedAt), asc(emailSuppressions.email))
    .limit(filter.limit);
}

export async function getSuppression(input: {
  actorUserId: string;
  orgId: string;
  suppressionId: string;
}): Promise<SuppressionRecord> {
  requireSuppressionId(input.suppressionId);
  const [row] = await db
    .select({ ...suppressionSelection, role: orgMembers.role })
    .from(emailSuppressions)
    .innerJoin(
      orgMembers,
      and(
        eq(orgMembers.orgId, emailSuppressions.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .where(
      and(
        eq(emailSuppressions.id, input.suppressionId),
        eq(emailSuppressions.orgId, input.orgId),
      ),
    )
    .limit(1);

  if (!row || !isOrgRole(row.role)) {
    throw new SuppressionError("SUPPRESSION_NOT_FOUND");
  }

  requirePermission(row.role, "suppressions.read");
  const { role: _role, ...suppression } = row;
  return suppression;
}

export async function createSuppression(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<SuppressionRecord> {
  const definition = parseCreateSuppressionInput(input.payload);
  const now = input.now ?? new Date();

  try {
    return await db.transaction(async (tx) => {
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
            eq(orgMembers.userId, input.actorUserId),
          ),
        )
        .limit(1);

      if (!membership || !isOrgRole(membership.role)) {
        throw new SuppressionError("MEMBERSHIP_REQUIRED");
      }

      requirePermission(membership.role, "suppressions.manage");
      const [created] = await tx
        .insert(emailSuppressions)
        .values({
          ...definition,
          createdAt: now,
          orgId: input.orgId,
          updatedAt: now,
        })
        .returning(suppressionSelection);

      if (!created) throw new SuppressionError("SUPPRESSION_NOT_FOUND");
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SuppressionError("SUPPRESSION_EXISTS");
    }
    throw error;
  }
}

export async function updateSuppression(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
  suppressionId: string;
}): Promise<SuppressionRecord> {
  requireSuppressionId(input.suppressionId);
  const changes = parseUpdateSuppressionInput(input.payload);
  const now = input.now ?? new Date();

  try {
    return await db.transaction(async (tx) => {
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
            eq(orgMembers.userId, input.actorUserId),
          ),
        )
        .limit(1);

      if (!membership || !isOrgRole(membership.role)) {
        throw new SuppressionError("MEMBERSHIP_REQUIRED");
      }

      requirePermission(membership.role, "suppressions.manage");
      const [updated] = await tx
        .update(emailSuppressions)
        .set({ ...changes, updatedAt: now })
        .where(
          and(
            eq(emailSuppressions.id, input.suppressionId),
            eq(emailSuppressions.orgId, input.orgId),
          ),
        )
        .returning(suppressionSelection);

      if (!updated) throw new SuppressionError("SUPPRESSION_NOT_FOUND");
      return updated;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new SuppressionError("SUPPRESSION_EXISTS");
    }
    throw error;
  }
}

export async function deleteSuppression(input: {
  actorUserId: string;
  orgId: string;
  suppressionId: string;
}): Promise<void> {
  requireSuppressionId(input.suppressionId);

  await db.transaction(async (tx) => {
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
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .limit(1);

    if (!membership || !isOrgRole(membership.role)) {
      throw new SuppressionError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(membership.role, "suppressions.manage");
    const deleted = await tx
      .delete(emailSuppressions)
      .where(
        and(
          eq(emailSuppressions.id, input.suppressionId),
          eq(emailSuppressions.orgId, input.orgId),
        ),
      )
      .returning({ id: emailSuppressions.id });

    if (deleted.length !== 1) {
      throw new SuppressionError("SUPPRESSION_NOT_FOUND");
    }
  });
}

export async function importSuppressions(input: {
  actorUserId: string;
  csv: string;
  now?: Date;
  orgId: string;
}): Promise<SuppressionImportResult> {
  await requireOrganizationPermission({
    actorUserId: input.actorUserId,
    orgId: input.orgId,
    permission: "suppressions.manage",
  });
  const parsed = parseSuppressionCsv(input.csv);
  const now = input.now ?? new Date();

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
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .limit(1);

    if (!membership || !isOrgRole(membership.role)) {
      throw new SuppressionError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(membership.role, "suppressions.manage");
    const existing = await tx
      .select({ email: emailSuppressions.email, reason: emailSuppressions.reason })
      .from(emailSuppressions)
      .where(
        and(
          eq(emailSuppressions.orgId, input.orgId),
          inArray(
            emailSuppressions.email,
            parsed.rows.map((row) => row.email),
          ),
        ),
      );
    const existingByEmail = new Map(existing.map((row) => [row.email, row.reason]));
    const created = parsed.rows.filter((row) => !existingByEmail.has(row.email)).length;
    const updated = parsed.rows.filter((row) => {
      const current = existingByEmail.get(row.email);
      return current !== undefined && reasonRank(row.reason) > reasonRank(current);
    }).length;

    await tx
      .insert(emailSuppressions)
      .values(
        parsed.rows.map((row) => ({
          ...row,
          createdAt: now,
          orgId: input.orgId,
          updatedAt: now,
        })),
      )
      .onConflictDoUpdate({
        set: {
          reason: sql`case
            when ${emailSuppressions.reason} = 'complained' or excluded.reason = 'complained' then 'complained'
            when ${emailSuppressions.reason} = 'bounced' or excluded.reason = 'bounced' then 'bounced'
            else 'manual'
          end`,
          updatedAt: sql`case
            when (${emailSuppressions.reason} = 'manual' and excluded.reason in ('bounced', 'complained'))
              or (${emailSuppressions.reason} = 'bounced' and excluded.reason = 'complained')
            then ${now}
            else ${emailSuppressions.updatedAt}
          end`,
        },
        target: [emailSuppressions.orgId, emailSuppressions.email],
      });

    return {
      created,
      importedAt: now,
      inputRows: parsed.inputRows,
      unchanged: parsed.rows.length - created - updated,
      uniqueRows: parsed.rows.length,
      updated,
    };
  });
}
