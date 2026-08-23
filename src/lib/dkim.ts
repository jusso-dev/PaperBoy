import { and, asc, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { domainDkimKeys, domains, orgMembers } from "@/db/schema";
import {
  isOrgRole,
  requirePermission,
  type OrgRole,
} from "@/lib/authorization";
import {
  DkimError,
  configuredDkimEncryptionKey,
  decryptDkimPrivateKey,
  isDkimKeyStatus,
  prepareEncryptedDkimKey,
  signRawEmail,
  type DkimKeyStatus,
} from "@/lib/dkim-core";
import {
  DomainError,
  isDnsCheckStatus,
  type DnsCheckStatus,
} from "@/lib/domain-core";

export type DkimKeyRecord = {
  activatedAt: Date | null;
  createdAt: Date;
  dnsStatus: DnsCheckStatus;
  id: string;
  lastCheckedAt: Date | null;
  publicKey: string;
  retiredAt: Date | null;
  selector: string;
  status: DkimKeyStatus;
  updatedAt: Date;
};

function normalizeDkimKeyRow(row: {
  activatedAt: Date | null;
  createdAt: Date;
  dnsStatus: string;
  id: string;
  lastCheckedAt: Date | null;
  publicKey: string;
  retiredAt: Date | null;
  selector: string;
  status: string;
  updatedAt: Date;
}): DkimKeyRecord {
  return {
    ...row,
    dnsStatus: isDnsCheckStatus(row.dnsStatus) ? row.dnsStatus : "unchecked",
    status: isDkimKeyStatus(row.status) ? row.status : "retired",
  };
}

async function requireDkimRole(input: {
  actorUserId: string;
  domainId: string;
  orgId: string;
}): Promise<OrgRole> {
  const [access] = await db
    .select({ role: orgMembers.role })
    .from(domains)
    .innerJoin(
      orgMembers,
      and(
        eq(orgMembers.orgId, domains.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .where(and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)))
    .limit(1);

  if (!access || !isOrgRole(access.role)) {
    throw new DomainError("DOMAIN_NOT_FOUND");
  }

  requirePermission(access.role, "domains.manageDkim");
  return access.role;
}

async function lockDkimAccess(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    actorUserId: string;
    domainId: string;
    orgId: string;
  },
): Promise<void> {
  const [access] = await tx
    .select({ role: orgMembers.role })
    .from(domains)
    .innerJoin(
      orgMembers,
      and(
        eq(orgMembers.orgId, domains.orgId),
        eq(orgMembers.userId, input.actorUserId),
      ),
    )
    .where(and(eq(domains.id, input.domainId), eq(domains.orgId, input.orgId)))
    .for("update");

  if (!access || !isOrgRole(access.role)) {
    throw new DomainError("DOMAIN_NOT_FOUND");
  }

  requirePermission(access.role, "domains.manageDkim");
}

export async function dkimKeysByDomainIds(
  domainIds: string[],
): Promise<Map<string, DkimKeyRecord[]>> {
  const byDomain = new Map<string, DkimKeyRecord[]>();

  if (domainIds.length === 0) {
    return byDomain;
  }

  const rows = await db
    .select({
      activatedAt: domainDkimKeys.activatedAt,
      createdAt: domainDkimKeys.createdAt,
      dnsStatus: domainDkimKeys.dnsStatus,
      domainId: domainDkimKeys.domainId,
      id: domainDkimKeys.id,
      lastCheckedAt: domainDkimKeys.lastCheckedAt,
      publicKey: domainDkimKeys.publicKey,
      retiredAt: domainDkimKeys.retiredAt,
      selector: domainDkimKeys.selector,
      status: domainDkimKeys.status,
      updatedAt: domainDkimKeys.updatedAt,
    })
    .from(domainDkimKeys)
    .where(inArray(domainDkimKeys.domainId, domainIds))
    .orderBy(asc(domainDkimKeys.createdAt));

  for (const row of rows) {
    const normalized = normalizeDkimKeyRow(row);
    const keys = byDomain.get(row.domainId) ?? [];
    keys.push(normalized);
    byDomain.set(row.domainId, keys);
  }

  return byDomain;
}

export async function setupDomainDkim(input: {
  actorUserId: string;
  domainId: string;
  encryptionKey?: Buffer;
  now?: Date;
  orgId: string;
}): Promise<void> {
  await requireDkimRole(input);

  const [existing] = await db
    .select({ id: domainDkimKeys.id })
    .from(domainDkimKeys)
    .where(
      and(
        eq(domainDkimKeys.domainId, input.domainId),
        ne(domainDkimKeys.status, "retired"),
      ),
    )
    .limit(1);

  if (existing) {
    return;
  }

  const prepared = await prepareEncryptedDkimKey({
    domainId: input.domainId,
    encryptionKey: input.encryptionKey,
    now: input.now,
  });

  await db.transaction(async (tx) => {
    await lockDkimAccess(tx, input);
    const [current] = await tx
      .select({ id: domainDkimKeys.id })
      .from(domainDkimKeys)
      .where(
        and(
          eq(domainDkimKeys.domainId, input.domainId),
          ne(domainDkimKeys.status, "retired"),
        ),
      )
      .for("update");

    if (current) {
      return;
    }

    await tx.insert(domainDkimKeys).values({
      domainId: input.domainId,
      encryptedPrivateKey: prepared.encryptedPrivateKey,
      id: prepared.id,
      publicKey: prepared.publicKey,
      selector: prepared.selector,
      status: "pending",
    });
  });
}

export async function rotateDomainDkim(input: {
  actorUserId: string;
  domainId: string;
  encryptionKey?: Buffer;
  now?: Date;
  orgId: string;
}): Promise<void> {
  await requireDkimRole(input);
  const currentKeys = await db
    .select({ status: domainDkimKeys.status })
    .from(domainDkimKeys)
    .where(
      and(
        eq(domainDkimKeys.domainId, input.domainId),
        ne(domainDkimKeys.status, "retired"),
      ),
    );

  if (!currentKeys.some((key) => key.status === "active")) {
    throw new DkimError("KEY_NOT_ACTIVE");
  }

  if (currentKeys.some((key) => key.status !== "active")) {
    throw new DkimError("ROTATION_PENDING");
  }

  const prepared = await prepareEncryptedDkimKey({
    domainId: input.domainId,
    encryptionKey: input.encryptionKey,
    now: input.now,
  });

  await db.transaction(async (tx) => {
    await lockDkimAccess(tx, input);
    const keys = await tx
      .select({ status: domainDkimKeys.status })
      .from(domainDkimKeys)
      .where(
        and(
          eq(domainDkimKeys.domainId, input.domainId),
          ne(domainDkimKeys.status, "retired"),
        ),
      )
      .for("update");

    if (!keys.some((key) => key.status === "active")) {
      throw new DkimError("KEY_NOT_ACTIVE");
    }

    if (keys.some((key) => key.status !== "active")) {
      throw new DkimError("ROTATION_PENDING");
    }

    await tx.insert(domainDkimKeys).values({
      domainId: input.domainId,
      encryptedPrivateKey: prepared.encryptedPrivateKey,
      id: prepared.id,
      publicKey: prepared.publicKey,
      selector: prepared.selector,
      status: "pending",
    });
  });
}

export async function finalizeDomainDkimRotation(input: {
  actorUserId: string;
  domainId: string;
  now?: Date;
  orgId: string;
}): Promise<void> {
  const retiredAt = input.now ?? new Date();

  await db.transaction(async (tx) => {
    await lockDkimAccess(tx, input);
    const keys = await tx
      .select({ id: domainDkimKeys.id, status: domainDkimKeys.status })
      .from(domainDkimKeys)
      .where(
        and(
          eq(domainDkimKeys.domainId, input.domainId),
          ne(domainDkimKeys.status, "retired"),
        ),
      )
      .for("update");

    if (
      keys.some((key) => key.status === "pending") ||
      !keys.some((key) => key.status === "active")
    ) {
      throw new DkimError("ROTATION_NOT_READY");
    }

    const retiring = keys.find((key) => key.status === "retiring");

    if (!retiring) {
      throw new DkimError("ROTATION_NOT_READY");
    }

    await tx
      .update(domainDkimKeys)
      .set({
        encryptedPrivateKey: null,
        retiredAt,
        status: "retired",
        updatedAt: retiredAt,
      })
      .where(
        and(
          eq(domainDkimKeys.id, retiring.id),
          eq(domainDkimKeys.domainId, input.domainId),
        ),
      );
  });
}

export async function signOutboundMessage(input: {
  domainId: string;
  encryptionKey?: Buffer;
  now?: Date;
  orgId: string;
  rawMessage: Buffer | string;
}): Promise<Buffer> {
  const [key] = await db
    .select({
      domain: domains.name,
      encryptedPrivateKey: domainDkimKeys.encryptedPrivateKey,
      id: domainDkimKeys.id,
      selector: domainDkimKeys.selector,
    })
    .from(domains)
    .innerJoin(
      domainDkimKeys,
      and(
        eq(domainDkimKeys.domainId, domains.id),
        eq(domainDkimKeys.status, "active"),
      ),
    )
    .where(
      and(
        eq(domains.id, input.domainId),
        eq(domains.orgId, input.orgId),
        eq(domains.status, "verified"),
      ),
    )
    .limit(1);

  if (!key?.encryptedPrivateKey) {
    throw new DomainError("DOMAIN_NOT_VERIFIED");
  }

  const privateKey = decryptDkimPrivateKey({
    context: { domainId: input.domainId, keyId: key.id },
    encryptedPrivateKey: key.encryptedPrivateKey,
    encryptionKey: input.encryptionKey ?? configuredDkimEncryptionKey(),
  });

  return signRawEmail({
    domain: key.domain,
    now: input.now,
    privateKey,
    rawMessage: input.rawMessage,
    selector: key.selector,
  });
}
