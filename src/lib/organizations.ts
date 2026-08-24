import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  orgInvites,
  orgMembers,
  orgs,
  users,
} from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
  type OrgRole,
} from "@/lib/authorization";

type UserOrganizationSeed = {
  id: string;
  name: string;
  defaultOrgId?: string | null;
  activeOrgId?: string | null;
};

export type OrganizationContext = {
  id: string;
  name: string;
  role: OrgRole;
  userId: string;
};

export type OrganizationErrorCode =
  | "ALREADY_MEMBER"
  | "CANNOT_REMOVE_OWNER"
  | "CANNOT_REMOVE_SELF"
  | "INVALID_EMAIL"
  | "INVALID_NAME"
  | "INVALID_ROLE"
  | "INVITATION_NOT_FOUND"
  | "MEMBERSHIP_REQUIRED"
  | "USER_NOT_FOUND";

export class OrganizationError extends Error {
  constructor(readonly code: OrganizationErrorCode) {
    super(code);
    this.name = "OrganizationError";
  }
}

function defaultOrganizationName(name: string): string {
  const ownerName = name.trim().slice(0, 80) || "My";
  return `${ownerName}'s workspace`;
}

export function normalizeInviteEmail(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const email = value.trim().toLowerCase();

  if (
    email.length === 0 ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    return null;
  }

  return email;
}

export function normalizeOrganizationName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  return name.length >= 1 &&
    name.length <= 120 &&
    !/[\u0000-\u001f\u007f]/.test(name)
    ? name
    : null;
}

export async function ensureDefaultOrganization(user: UserOrganizationSeed) {
  if (user.defaultOrgId && user.activeOrgId) {
    return {
      activeOrgId: user.activeOrgId,
      defaultOrgId: user.defaultOrgId,
    };
  }

  return db.transaction(async (tx) => {
    const [lockedUser] = await tx
      .select({
        activeOrgId: users.activeOrgId,
        defaultOrgId: users.defaultOrgId,
        name: users.name,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .for("update");

    if (!lockedUser) {
      throw new OrganizationError("USER_NOT_FOUND");
    }

    if (lockedUser.defaultOrgId) {
      const activeOrgId = lockedUser.activeOrgId ?? lockedUser.defaultOrgId;

      if (!lockedUser.activeOrgId) {
        await tx
          .update(users)
          .set({ activeOrgId })
          .where(eq(users.id, user.id));
      }

      return {
        activeOrgId,
        defaultOrgId: lockedUser.defaultOrgId,
      };
    }

    const [organization] = await tx
      .insert(orgs)
      .values({ name: defaultOrganizationName(lockedUser.name) })
      .returning({ id: orgs.id });

    if (!organization) {
      throw new OrganizationError("USER_NOT_FOUND");
    }

    await tx.insert(orgMembers).values({
      orgId: organization.id,
      role: "owner",
      userId: user.id,
    });

    await tx
      .update(users)
      .set({
        activeOrgId: organization.id,
        defaultOrgId: organization.id,
      })
      .where(eq(users.id, user.id));

    return {
      activeOrgId: organization.id,
      defaultOrgId: organization.id,
    };
  });
}

async function findOrganizationContext(
  userId: string,
  orgId?: string | null,
): Promise<OrganizationContext | null> {
  const conditions = [eq(orgMembers.userId, userId)];

  if (orgId) {
    conditions.push(eq(orgMembers.orgId, orgId));
  }

  const [membership] = await db
    .select({
      id: orgs.id,
      name: orgs.name,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
    .where(and(...conditions))
    .orderBy(asc(orgMembers.createdAt))
    .limit(1);

  if (!membership || !isOrgRole(membership.role)) {
    return null;
  }

  return {
    id: membership.id,
    name: membership.name,
    role: membership.role,
    userId,
  };
}

export async function getActiveOrganizationContext(
  userId: string,
): Promise<OrganizationContext> {
  const [user] = await db
    .select({
      activeOrgId: users.activeOrgId,
      defaultOrgId: users.defaultOrgId,
      id: users.id,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new OrganizationError("USER_NOT_FOUND");
  }

  const ids = await ensureDefaultOrganization(user);
  const active = await findOrganizationContext(userId, ids.activeOrgId);

  if (active) {
    return active;
  }

  const fallback = await findOrganizationContext(userId);

  if (!fallback) {
    await db
      .update(users)
      .set({ activeOrgId: null, defaultOrgId: null })
      .where(eq(users.id, userId));

    const repairedIds = await ensureDefaultOrganization({
      activeOrgId: null,
      defaultOrgId: null,
      id: user.id,
      name: user.name,
    });
    const repaired = await findOrganizationContext(
      userId,
      repairedIds.activeOrgId,
    );

    if (!repaired) {
      throw new OrganizationError("MEMBERSHIP_REQUIRED");
    }

    return repaired;
  }

  await db
    .update(users)
    .set({ activeOrgId: fallback.id })
    .where(eq(users.id, userId));

  return fallback;
}

export async function listUserOrganizations(userId: string) {
  return db
    .select({
      id: orgs.id,
      name: orgs.name,
      role: orgMembers.role,
    })
    .from(orgMembers)
    .innerJoin(orgs, eq(orgs.id, orgMembers.orgId))
    .where(eq(orgMembers.userId, userId))
    .orderBy(asc(orgs.name));
}

export async function listOrganizationMembers(orgId: string) {
  return db
    .select({
      createdAt: orgMembers.createdAt,
      email: users.email,
      id: orgMembers.id,
      name: users.name,
      role: orgMembers.role,
      userId: users.id,
    })
    .from(orgMembers)
    .innerJoin(users, eq(users.id, orgMembers.userId))
    .where(eq(orgMembers.orgId, orgId))
    .orderBy(asc(users.name));
}

export async function listOrganizationInvitations(orgId: string) {
  return db
    .select({
      createdAt: orgInvites.createdAt,
      email: orgInvites.email,
      id: orgInvites.id,
      role: orgInvites.role,
    })
    .from(orgInvites)
    .where(
      and(
        eq(orgInvites.orgId, orgId),
        isNull(orgInvites.acceptedAt),
        isNull(orgInvites.revokedAt),
      ),
    )
    .orderBy(asc(orgInvites.createdAt));
}

export async function listPendingInvitationsForUser(email: string) {
  return db
    .select({
      id: orgInvites.id,
      orgId: orgs.id,
      orgName: orgs.name,
      role: orgInvites.role,
    })
    .from(orgInvites)
    .innerJoin(orgs, eq(orgs.id, orgInvites.orgId))
    .where(
      and(
        eq(orgInvites.email, email.toLowerCase()),
        isNull(orgInvites.acceptedAt),
        isNull(orgInvites.revokedAt),
      ),
    )
    .orderBy(asc(orgs.name));
}

export async function inviteOrganizationMember(input: {
  actorUserId: string;
  email: unknown;
  orgId: string;
  role: unknown;
}) {
  const email = normalizeInviteEmail(input.email);
  const role = input.role;

  if (!email) {
    throw new OrganizationError("INVALID_EMAIL");
  }

  if (!isOrgRole(role) || role === "owner") {
    throw new OrganizationError("INVALID_ROLE");
  }

  return db.transaction(async (tx) => {
    const [actor] = await tx
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, input.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .limit(1);

    if (!actor || !isOrgRole(actor.role)) {
      throw new OrganizationError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(actor.role, "members.invite");

    const [existingMember] = await tx
      .select({ id: orgMembers.id })
      .from(users)
      .innerJoin(
        orgMembers,
        and(
          eq(orgMembers.userId, users.id),
          eq(orgMembers.orgId, input.orgId),
        ),
      )
      .where(eq(users.email, email))
      .limit(1);

    if (existingMember) {
      throw new OrganizationError("ALREADY_MEMBER");
    }

    const [invitation] = await tx
      .insert(orgInvites)
      .values({
        email,
        invitedByUserId: input.actorUserId,
        orgId: input.orgId,
        role,
      })
      .onConflictDoUpdate({
        target: [orgInvites.orgId, orgInvites.email],
        set: {
          acceptedAt: null,
          acceptedByUserId: null,
          invitedByUserId: input.actorUserId,
          revokedAt: null,
          role,
          updatedAt: new Date(),
        },
      })
      .returning({ id: orgInvites.id });

    return invitation;
  });
}

export async function acceptOrganizationInvitation(input: {
  email: string;
  invitationId: string;
  userId: string;
}) {
  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({
        acceptedAt: orgInvites.acceptedAt,
        email: orgInvites.email,
        orgId: orgInvites.orgId,
        revokedAt: orgInvites.revokedAt,
        role: orgInvites.role,
      })
      .from(orgInvites)
      .where(eq(orgInvites.id, input.invitationId))
      .for("update");

    if (
      !invitation ||
      invitation.acceptedAt ||
      invitation.revokedAt ||
      invitation.email !== input.email.toLowerCase() ||
      !isOrgRole(invitation.role) ||
      invitation.role === "owner"
    ) {
      throw new OrganizationError("INVITATION_NOT_FOUND");
    }

    await tx
      .insert(orgMembers)
      .values({
        orgId: invitation.orgId,
        role: invitation.role,
        userId: input.userId,
      })
      .onConflictDoNothing({
        target: [orgMembers.orgId, orgMembers.userId],
      });

    await tx
      .update(orgInvites)
      .set({
        acceptedAt: new Date(),
        acceptedByUserId: input.userId,
      })
      .where(eq(orgInvites.id, input.invitationId));

    await tx
      .update(users)
      .set({ activeOrgId: invitation.orgId })
      .where(eq(users.id, input.userId));
  });
}

export async function switchActiveOrganization(input: {
  orgId: string;
  userId: string;
}) {
  const membership = await findOrganizationContext(input.userId, input.orgId);

  if (!membership) {
    throw new OrganizationError("MEMBERSHIP_REQUIRED");
  }

  await db
    .update(users)
    .set({ activeOrgId: input.orgId })
    .where(eq(users.id, input.userId));
}

export async function renameOrganization(input: {
  actorUserId: string;
  name: unknown;
  orgId: string;
}) {
  const name = normalizeOrganizationName(input.name);
  if (!name) throw new OrganizationError("INVALID_NAME");

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
      throw new OrganizationError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(membership.role, "organizations.rename");
    const [updated] = await tx
      .update(orgs)
      .set({ name, updatedAt: new Date() })
      .where(eq(orgs.id, input.orgId))
      .returning({ id: orgs.id, name: orgs.name });

    if (!updated) throw new OrganizationError("MEMBERSHIP_REQUIRED");
    return updated;
  });
}

export async function removeOrganizationMember(input: {
  actorUserId: string;
  membershipId: string;
}) {
  return db.transaction(async (tx) => {
    const [target] = await tx
      .select({
        orgId: orgMembers.orgId,
        role: orgMembers.role,
        userId: orgMembers.userId,
      })
      .from(orgMembers)
      .where(eq(orgMembers.id, input.membershipId))
      .for("update");

    if (!target || !isOrgRole(target.role)) {
      throw new OrganizationError("MEMBERSHIP_REQUIRED");
    }

    const [actor] = await tx
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, target.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .limit(1);

    if (!actor || !isOrgRole(actor.role)) {
      throw new OrganizationError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(actor.role, "members.remove");

    if (target.userId === input.actorUserId) {
      throw new OrganizationError("CANNOT_REMOVE_SELF");
    }

    if (target.role === "owner") {
      throw new OrganizationError("CANNOT_REMOVE_OWNER");
    }

    await tx.delete(orgMembers).where(eq(orgMembers.id, input.membershipId));

    const [targetUser] = await tx
      .select({ defaultOrgId: users.defaultOrgId })
      .from(users)
      .where(eq(users.id, target.userId))
      .limit(1);

    await tx
      .update(users)
      .set({ activeOrgId: targetUser?.defaultOrgId ?? null })
      .where(
        and(
          eq(users.id, target.userId),
          eq(users.activeOrgId, target.orgId),
        ),
      );
  });
}
