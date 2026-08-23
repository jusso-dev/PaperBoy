import { and, asc, count, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { audiences, contacts, orgMembers } from "@/db/schema";
import {
  AudienceError,
  MAX_AUDIENCE_CONTACTS,
  parseContactCsv,
  parseCreateAudienceInput,
  parseCreateContactInput,
  parseUpdateAudienceInput,
  parseUpdateContactInput,
  type AudienceRecord,
  type ContactRecord,
} from "@/lib/audience-core";
import {
  isOrgRole,
  requirePermission,
  type OrgPermission,
} from "@/lib/authorization";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const audienceSelection = {
  createdAt: audiences.createdAt,
  id: audiences.id,
  name: audiences.name,
  updatedAt: audiences.updatedAt,
};
const contactSelection = {
  audienceId: contacts.audienceId,
  createdAt: contacts.createdAt,
  email: contacts.email,
  id: contacts.id,
  name: contacts.name,
  unsubscribedAt: contacts.unsubscribedAt,
  updatedAt: contacts.updatedAt,
};

export type ContactImportResult = {
  created: number;
  importedAt: Date;
  inputRows: number;
  unchanged: number;
  uniqueRows: number;
  updated: number;
};

export type AudienceRecipient = {
  email: string;
  id: string;
  name: string | null;
  position: number;
};

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if ("code" in error && error.code === "23505") return true;
  return "cause" in error && isUniqueViolation(error.cause);
}

function requireId(value: string, code: "AUDIENCE_NOT_FOUND" | "CONTACT_NOT_FOUND") {
  if (!UUID_PATTERN.test(value)) throw new AudienceError(code);
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
    throw new AudienceError("MEMBERSHIP_REQUIRED");
  }
  requirePermission(membership.role, input.permission);
}

async function countsForAudience(audienceId: string) {
  const [row] = await db
    .select({
      active: sql<number>`count(${contacts.id}) filter (where ${isNull(contacts.unsubscribedAt)})`,
      total: count(contacts.id),
    })
    .from(contacts)
    .where(eq(contacts.audienceId, audienceId));
  return {
    activeContactCount: Number(row?.active ?? 0),
    contactCount: Number(row?.total ?? 0),
  };
}

async function audienceRecord(
  row: typeof audiences.$inferSelect | Pick<typeof audiences.$inferSelect, keyof typeof audienceSelection>,
): Promise<AudienceRecord> {
  return { ...row, ...(await countsForAudience(row.id)) };
}

async function readAudience(input: { audienceId: string; orgId: string }) {
  requireId(input.audienceId, "AUDIENCE_NOT_FOUND");
  const [row] = await db
    .select(audienceSelection)
    .from(audiences)
    .where(
      and(eq(audiences.id, input.audienceId), eq(audiences.orgId, input.orgId)),
    )
    .limit(1);
  if (!row) throw new AudienceError("AUDIENCE_NOT_FOUND");
  return row;
}

async function readContact(input: {
  audienceId: string;
  contactId: string;
  orgId: string;
}) {
  requireId(input.audienceId, "AUDIENCE_NOT_FOUND");
  requireId(input.contactId, "CONTACT_NOT_FOUND");
  const [row] = await db
    .select(contactSelection)
    .from(contacts)
    .innerJoin(audiences, eq(audiences.id, contacts.audienceId))
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.audienceId, input.audienceId),
        eq(audiences.orgId, input.orgId),
      ),
    )
    .limit(1);
  if (!row) throw new AudienceError("CONTACT_NOT_FOUND");
  return row;
}

export async function listAudiences(input: {
  actorUserId: string;
  orgId: string;
}): Promise<AudienceRecord[]> {
  await requireOrganizationPermission({ ...input, permission: "audiences.read" });
  const rows = await db
    .select(audienceSelection)
    .from(audiences)
    .where(eq(audiences.orgId, input.orgId))
    .orderBy(desc(audiences.updatedAt), asc(audiences.name))
    .limit(100);
  return Promise.all(rows.map(audienceRecord));
}

export async function getAudience(input: {
  actorUserId: string;
  audienceId: string;
  orgId: string;
}): Promise<AudienceRecord> {
  await requireOrganizationPermission({ ...input, permission: "audiences.read" });
  return audienceRecord(await readAudience(input));
}

export async function createAudience(input: {
  actorUserId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<AudienceRecord> {
  await requireOrganizationPermission({ ...input, permission: "audiences.manage" });
  const definition = parseCreateAudienceInput(input.payload);
  const now = input.now ?? new Date();
  try {
    const [created] = await db
      .insert(audiences)
      .values({ ...definition, createdAt: now, orgId: input.orgId, updatedAt: now })
      .returning(audienceSelection);
    if (!created) throw new AudienceError("AUDIENCE_NOT_FOUND");
    return audienceRecord(created);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AudienceError("AUDIENCE_EXISTS");
    throw error;
  }
}

export async function updateAudience(input: {
  actorUserId: string;
  audienceId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<AudienceRecord> {
  requireId(input.audienceId, "AUDIENCE_NOT_FOUND");
  await requireOrganizationPermission({ ...input, permission: "audiences.manage" });
  const definition = parseUpdateAudienceInput(input.payload);
  try {
    const [updated] = await db
      .update(audiences)
      .set({ ...definition, updatedAt: input.now ?? new Date() })
      .where(
        and(eq(audiences.id, input.audienceId), eq(audiences.orgId, input.orgId)),
      )
      .returning(audienceSelection);
    if (!updated) throw new AudienceError("AUDIENCE_NOT_FOUND");
    return audienceRecord(updated);
  } catch (error) {
    if (isUniqueViolation(error)) throw new AudienceError("AUDIENCE_EXISTS");
    throw error;
  }
}

export async function deleteAudience(input: {
  actorUserId: string;
  audienceId: string;
  orgId: string;
}): Promise<void> {
  requireId(input.audienceId, "AUDIENCE_NOT_FOUND");
  await requireOrganizationPermission({ ...input, permission: "audiences.manage" });
  const deleted = await db
    .delete(audiences)
    .where(
      and(eq(audiences.id, input.audienceId), eq(audiences.orgId, input.orgId)),
    )
    .returning({ id: audiences.id });
  if (deleted.length !== 1) throw new AudienceError("AUDIENCE_NOT_FOUND");
}

export async function listContacts(input: {
  actorUserId: string;
  audienceId: string;
  orgId: string;
}): Promise<ContactRecord[]> {
  await requireOrganizationPermission({ ...input, permission: "audiences.read" });
  await readAudience(input);
  return db
    .select(contactSelection)
    .from(contacts)
    .where(eq(contacts.audienceId, input.audienceId))
    .orderBy(asc(contacts.email));
}

export async function getContact(input: {
  actorUserId: string;
  audienceId: string;
  contactId: string;
  orgId: string;
}): Promise<ContactRecord> {
  await requireOrganizationPermission({ ...input, permission: "audiences.read" });
  return readContact(input);
}

export async function createContact(input: {
  actorUserId: string;
  audienceId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<ContactRecord> {
  requireId(input.audienceId, "AUDIENCE_NOT_FOUND");
  await requireOrganizationPermission({ ...input, permission: "audiences.manage" });
  const definition = parseCreateContactInput(input.payload);
  const now = input.now ?? new Date();
  try {
    return await db.transaction(async (tx) => {
      const [audience] = await tx
        .select({ id: audiences.id })
        .from(audiences)
        .where(
          and(eq(audiences.id, input.audienceId), eq(audiences.orgId, input.orgId)),
        )
        .for("update");
      if (!audience) throw new AudienceError("AUDIENCE_NOT_FOUND");
      const [size] = await tx
        .select({ value: count() })
        .from(contacts)
        .where(eq(contacts.audienceId, input.audienceId));
      if (Number(size?.value ?? 0) >= MAX_AUDIENCE_CONTACTS) {
        throw new AudienceError("AUDIENCE_FULL");
      }
      const [created] = await tx
        .insert(contacts)
        .values({
          ...definition,
          audienceId: input.audienceId,
          createdAt: now,
          updatedAt: now,
        })
        .returning(contactSelection);
      if (!created) throw new AudienceError("CONTACT_NOT_FOUND");
      return created;
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AudienceError("CONTACT_EXISTS");
    throw error;
  }
}

export async function updateContact(input: {
  actorUserId: string;
  audienceId: string;
  contactId: string;
  now?: Date;
  orgId: string;
  payload: unknown;
}): Promise<ContactRecord> {
  requireId(input.contactId, "CONTACT_NOT_FOUND");
  await requireOrganizationPermission({ ...input, permission: "audiences.manage" });
  await readAudience(input);
  const changes = parseUpdateContactInput(input.payload);
  try {
    const [updated] = await db
      .update(contacts)
      .set({ ...changes, updatedAt: input.now ?? new Date() })
      .where(
        and(
          eq(contacts.id, input.contactId),
          eq(contacts.audienceId, input.audienceId),
        ),
      )
      .returning(contactSelection);
    if (!updated) throw new AudienceError("CONTACT_NOT_FOUND");
    return updated;
  } catch (error) {
    if (isUniqueViolation(error)) throw new AudienceError("CONTACT_EXISTS");
    throw error;
  }
}

export async function deleteContact(input: {
  actorUserId: string;
  audienceId: string;
  contactId: string;
  orgId: string;
}): Promise<void> {
  requireId(input.contactId, "CONTACT_NOT_FOUND");
  await requireOrganizationPermission({ ...input, permission: "audiences.manage" });
  await readAudience(input);
  const deleted = await db
    .delete(contacts)
    .where(
      and(
        eq(contacts.id, input.contactId),
        eq(contacts.audienceId, input.audienceId),
      ),
    )
    .returning({ id: contacts.id });
  if (deleted.length !== 1) throw new AudienceError("CONTACT_NOT_FOUND");
}

export async function importContacts(input: {
  actorUserId: string;
  audienceId: string;
  csv: string;
  now?: Date;
  orgId: string;
}): Promise<ContactImportResult> {
  requireId(input.audienceId, "AUDIENCE_NOT_FOUND");
  await requireOrganizationPermission({ ...input, permission: "audiences.manage" });
  const parsed = parseContactCsv(input.csv);
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [audience] = await tx
      .select({ id: audiences.id })
      .from(audiences)
      .where(
        and(eq(audiences.id, input.audienceId), eq(audiences.orgId, input.orgId)),
      )
      .for("update");
    if (!audience) throw new AudienceError("AUDIENCE_NOT_FOUND");
    const existing = await tx
      .select(contactSelection)
      .from(contacts)
      .where(eq(contacts.audienceId, input.audienceId));
    const existingByEmail = new Map(existing.map((contact) => [contact.email, contact]));
    const additions = parsed.rows.filter((row) => !existingByEmail.has(row.email));
    if (existing.length + additions.length > MAX_AUDIENCE_CONTACTS) {
      throw new AudienceError("AUDIENCE_FULL");
    }

    let created = 0;
    let updated = 0;
    let unchanged = 0;
    for (const row of parsed.rows) {
      const current = existingByEmail.get(row.email);
      if (!current) {
        await tx.insert(contacts).values({
          ...row,
          audienceId: input.audienceId,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      } else if (current.name !== row.name) {
        await tx
          .update(contacts)
          .set({ name: row.name, updatedAt: now })
          .where(eq(contacts.id, current.id));
        updated += 1;
      } else unchanged += 1;
    }

    return {
      created,
      importedAt: now,
      inputRows: parsed.inputRows,
      unchanged,
      uniqueRows: parsed.rows.length,
      updated,
    };
  });
}

export async function getActiveAudienceContacts(input: {
  audienceId: string;
  orgId: string;
}): Promise<AudienceRecipient[]> {
  await readAudience(input);
  const rows = await db
    .select({ email: contacts.email, id: contacts.id, name: contacts.name })
    .from(contacts)
    .where(
      and(
        eq(contacts.audienceId, input.audienceId),
        isNull(contacts.unsubscribedAt),
      ),
    )
    .orderBy(asc(contacts.createdAt), asc(contacts.id))
    .limit(MAX_AUDIENCE_CONTACTS + 1);
  if (rows.length > MAX_AUDIENCE_CONTACTS) throw new AudienceError("AUDIENCE_FULL");
  return rows.map((row, position) => ({ ...row, position }));
}
