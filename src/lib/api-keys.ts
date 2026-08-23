import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys, orgMembers } from "@/db/schema";
import {
  generateApiKey,
  isApiKeyEnvironment,
  parseApiKey,
  verifyApiKeyHash,
  type ApiKeyEnvironment,
} from "@/lib/api-key-crypto";
import { isOrgRole, requirePermission } from "@/lib/authorization";

export type ApiKeyPrincipal = {
  apiKeyId: string;
  environment: ApiKeyEnvironment;
  orgId: string;
};

export type ApiKeyErrorCode =
  | "INVALID_ENVIRONMENT"
  | "INVALID_NAME"
  | "KEY_NOT_FOUND"
  | "MEMBERSHIP_REQUIRED";

export class ApiKeyError extends Error {
  constructor(readonly code: ApiKeyErrorCode) {
    super(code);
    this.name = "ApiKeyError";
  }
}

function normalizeKeyName(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const name = value.trim();
  return name.length > 0 && name.length <= 80 ? name : null;
}

export async function createApiKey(input: {
  actorUserId: string;
  environment: unknown;
  name: unknown;
  orgId: string;
}) {
  const name = normalizeKeyName(input.name);
  const environment = input.environment;

  if (!name) {
    throw new ApiKeyError("INVALID_NAME");
  }

  if (!isApiKeyEnvironment(environment)) {
    throw new ApiKeyError("INVALID_ENVIRONMENT");
  }

  const generated = generateApiKey(environment);

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
      .limit(1);

    if (!membership || !isOrgRole(membership.role)) {
      throw new ApiKeyError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(membership.role, "apiKeys.create");

    const [created] = await tx
      .insert(apiKeys)
      .values({
        createdByUserId: input.actorUserId,
        environment,
        keyHash: generated.keyHash,
        keyId: generated.keyId,
        name,
        orgId: input.orgId,
      })
      .returning({ id: apiKeys.id });

    if (!created) {
      throw new ApiKeyError("KEY_NOT_FOUND");
    }

    return {
      ...generated,
      environment,
      id: created.id,
      name,
    };
  });
}

export async function listApiKeys(input: {
  actorUserId: string;
  orgId: string;
}) {
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
    throw new ApiKeyError("MEMBERSHIP_REQUIRED");
  }

  requirePermission(membership.role, "apiKeys.read");

  return db
    .select({
      createdAt: apiKeys.createdAt,
      environment: apiKeys.environment,
      id: apiKeys.id,
      keyId: apiKeys.keyId,
      lastUsedAt: apiKeys.lastUsedAt,
      name: apiKeys.name,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.orgId, input.orgId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKey(input: {
  actorUserId: string;
  apiKeyId: string;
}) {
  return db.transaction(async (tx) => {
    const [key] = await tx
      .select({ orgId: apiKeys.orgId })
      .from(apiKeys)
      .where(eq(apiKeys.id, input.apiKeyId))
      .for("update");

    if (!key) {
      throw new ApiKeyError("KEY_NOT_FOUND");
    }

    const [membership] = await tx
      .select({ role: orgMembers.role })
      .from(orgMembers)
      .where(
        and(
          eq(orgMembers.orgId, key.orgId),
          eq(orgMembers.userId, input.actorUserId),
        ),
      )
      .limit(1);

    if (!membership || !isOrgRole(membership.role)) {
      throw new ApiKeyError("MEMBERSHIP_REQUIRED");
    }

    requirePermission(membership.role, "apiKeys.revoke");

    await tx
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, input.apiKeyId), isNull(apiKeys.revokedAt)));
  });
}

export async function authenticateApiKey(
  rawKey: unknown,
): Promise<ApiKeyPrincipal | null> {
  const parsed = parseApiKey(rawKey);

  if (!parsed || typeof rawKey !== "string") {
    return null;
  }

  const [candidate] = await db
    .select({
      environment: apiKeys.environment,
      id: apiKeys.id,
      keyHash: apiKeys.keyHash,
      orgId: apiKeys.orgId,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.keyId, parsed.keyId))
    .limit(1);

  if (
    !candidate ||
    candidate.revokedAt ||
    candidate.environment !== parsed.environment ||
    !isApiKeyEnvironment(candidate.environment) ||
    !verifyApiKeyHash(rawKey, candidate.keyHash)
  ) {
    return null;
  }

  const [authenticated] = await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(
      and(
        eq(apiKeys.id, candidate.id),
        eq(apiKeys.keyHash, candidate.keyHash),
        isNull(apiKeys.revokedAt),
      ),
    )
    .returning({ id: apiKeys.id });

  if (!authenticated) {
    return null;
  }

  return {
    apiKeyId: candidate.id,
    environment: candidate.environment,
    orgId: candidate.orgId,
  };
}
