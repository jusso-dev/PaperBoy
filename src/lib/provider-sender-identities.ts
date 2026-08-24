import { normalizeSendingDomain } from "@/lib/domain-core";
import type {
  LiveOutboundProvider,
  OutboundProviderConnectionDetails,
} from "@/lib/outbound-provider-core";
import { testConfiguredOutboundProvider } from "@/lib/outbound-provider-runtime";

const CACHE_TTL_MS = 60_000;

type ConnectionTest = (input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
  provider: LiveOutboundProvider;
}) => Promise<OutboundProviderConnectionDetails | null>;

type CachedIdentities = {
  expiresAt: number;
  value: Promise<string[]>;
};

const cache = new Map<string, CachedIdentities>();

function normalizedVerifiedDomains(
  details: OutboundProviderConnectionDetails | null,
): string[] {
  if (!details?.sendingEnabled) return [];

  return [
    ...new Set(
      details.verifiedDomains
        .map(normalizeSendingDomain)
        .filter((domain): domain is string => Boolean(domain)),
    ),
  ].sort();
}

export async function providerVerifiedSenderDomains(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  now?: () => number;
  orgId: string;
  provider: LiveOutboundProvider;
  testConnection?: ConnectionTest;
}): Promise<string[]> {
  const testConnection = input.testConnection ?? testConfiguredOutboundProvider;

  if (input.testConnection) {
    return normalizedVerifiedDomains(await testConnection(input));
  }

  const now = input.now?.() ?? Date.now();
  const key = `${input.orgId}:${input.provider}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = testConnection(input).then(normalizedVerifiedDomains);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, value });

  try {
    return await value;
  } catch (error) {
    if (cache.get(key)?.value === value) cache.delete(key);
    throw error;
  }
}

export async function readySenderDomains(input: {
  defaultProvider: LiveOutboundProvider;
  domains: Array<{
    dkimKeys: Array<{ status: string }>;
    id: string;
    name: string;
    status: string;
  }>;
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
  providerDomains: Array<{
    effectiveProvider: LiveOutboundProvider;
    id: string;
  }>;
  testConnection?: ConnectionTest;
}): Promise<string[]> {
  const effectiveProviders = new Map(
    input.providerDomains.map((domain) => [
      domain.id,
      domain.effectiveProvider,
    ]),
  );
  const usesAwsSes =
    input.defaultProvider === "aws-ses" ||
    input.providerDomains.some(
      (domain) => domain.effectiveProvider === "aws-ses",
    );
  const sesDomains = usesAwsSes
    ? await providerVerifiedSenderDomains({
        environment: input.environment,
        orgId: input.orgId,
        provider: "aws-ses",
        testConnection: input.testConnection,
      })
    : [];
  const localDomains = input.domains
    .filter(
      (domain) =>
        domain.status === "verified" &&
        domain.dkimKeys.some((key) => key.status === "active") &&
        (effectiveProviders.get(domain.id) !== "aws-ses" ||
          sesDomains.includes(domain.name)),
    )
    .map((domain) => domain.name);

  return [
    ...new Set([
      ...localDomains,
      ...(input.defaultProvider === "aws-ses" ? sesDomains : []),
    ]),
  ].sort();
}
