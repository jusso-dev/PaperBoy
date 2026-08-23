import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import {
  isApiKeyEnvironment,
  parseApiKey,
  verifyApiKeyHash,
  type ApiKeyEnvironment,
} from "@/lib/api-key-crypto";

export type ApiKeyPrincipal = {
  apiKeyId: string;
  environment: ApiKeyEnvironment;
  orgId: string;
};

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
