import {
  OutboundProviderConfigurationError,
  providerConfigurationErrorMessage,
  providerSmtpConfiguration,
  requireProviderConfigured,
} from "@/lib/outbound-provider-configuration";
import {
  type LiveOutboundProvider,
  type OutboundProviderAdapter,
} from "@/lib/outbound-provider-core";
import { createSmtpAdapter } from "@/lib/smtp-adapter";
import {
  OutboundDeliveryError,
  testSinkAdapter,
  type OutboundAdapter,
} from "@/lib/worker-core";

export function createConfiguredOutboundProvider(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
  provider: LiveOutboundProvider;
}): OutboundProviderAdapter {
  requireProviderConfigured(input);

  if (input.provider === "smtp" || input.provider === "cloudflare-email") {
    const configuration = providerSmtpConfiguration({
      environment: input.environment,
      orgId: input.orgId,
      provider: input.provider,
    });
    if (!configuration) {
      throw new OutboundProviderConfigurationError(
        "CREDENTIALS_MISSING",
        input.provider,
      );
    }
    return createSmtpAdapter({
      environment: configuration.environment,
      provider: input.provider,
    });
  }

  throw new OutboundProviderConfigurationError(
    "ADAPTER_UNAVAILABLE",
    input.provider,
  );
}

export async function testConfiguredOutboundProvider(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
  provider: LiveOutboundProvider;
}): Promise<void> {
  const adapter = createConfiguredOutboundProvider(input);
  try {
    await adapter.testConnection();
  } finally {
    adapter.close?.();
  }
}

export function createEnvironmentOutboundRouter(input: {
  environment?: Readonly<Record<string, string | undefined>>;
} = {}): OutboundAdapter & { close: () => void } {
  const adapters = new Map<string, OutboundProviderAdapter>();

  return {
    name: "environment-outbound-provider-router",
    close() {
      for (const adapter of adapters.values()) adapter.close?.();
      adapters.clear();
    },
    async send(message) {
      if (message.provider === "test-sink") {
        return testSinkAdapter.send(message);
      }
      const key = `${message.orgId}:${message.provider}`;
      let adapter = adapters.get(key);
      if (!adapter) {
        try {
          adapter = createConfiguredOutboundProvider({
            environment: input.environment,
            orgId: message.orgId,
            provider: message.provider,
          });
        } catch (error) {
          if (error instanceof OutboundProviderConfigurationError) {
            throw new OutboundDeliveryError({
              code: "provider_configuration_error",
              reason: providerConfigurationErrorMessage(error),
              retryable: false,
            });
          }
          throw error;
        }
        adapters.set(key, adapter);
      }
      return adapter.send(message);
    },
  };
}
