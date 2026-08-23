import { smtpTransportOptions } from "@/lib/smtp-adapter";
import {
  type LiveOutboundProvider,
  providerLabel,
} from "@/lib/outbound-provider-core";

export type ProviderCredentialScope = "operator-default" | "organization";
export type ProviderRuntimeState =
  | "adapter-unavailable"
  | "configuration-invalid"
  | "credentials-missing"
  | "ready";

export type ProviderRuntimeStatus = {
  configured: boolean;
  credentialScope: ProviderCredentialScope | null;
  state: ProviderRuntimeState;
};

export class OutboundProviderConfigurationError extends Error {
  constructor(
    readonly code:
      | "ADAPTER_UNAVAILABLE"
      | "CONFIGURATION_INVALID"
      | "CONNECTION_FAILED"
      | "CREDENTIALS_MISSING",
    readonly provider: LiveOutboundProvider,
  ) {
    super(code);
    this.name = "OutboundProviderConfigurationError";
  }
}

type ProviderSmtpConfiguration = {
  environment: Readonly<Record<string, string | undefined>>;
  scope: ProviderCredentialScope;
};

function organizationToken(orgId: string): string {
  return orgId.replaceAll("-", "_").toUpperCase();
}

export function organizationProviderSecretVariable(
  orgId: string,
  provider: Extract<LiveOutboundProvider, "cloudflare-email" | "smtp">,
): string {
  const prefix =
    provider === "cloudflare-email"
      ? "PAPERBOY_CLOUDFLARE_EMAIL_SMTP_URL"
      : "PAPERBOY_SMTP_URL";
  return `${prefix}_${organizationToken(orgId)}`;
}

function firstDefined(
  environment: Readonly<Record<string, string | undefined>>,
  names: string[],
): { name: string; value: string | undefined } | null {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(environment, name)) {
      return { name, value: environment[name] };
    }
  }
  return null;
}

function isCloudflareSmtpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).hostname.toLowerCase() === "smtp.mx.cloudflare.net";
  } catch {
    return false;
  }
}

export function providerSmtpConfiguration(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
  provider: Extract<LiveOutboundProvider, "cloudflare-email" | "smtp">;
}): ProviderSmtpConfiguration | null {
  const environment = input.environment ?? process.env;
  const token = organizationToken(input.orgId);
  const scopedUrl = organizationProviderSecretVariable(
    input.orgId,
    input.provider,
  );
  const url =
    input.provider === "cloudflare-email"
      ? firstDefined(environment, [
          scopedUrl,
          "CLOUDFLARE_EMAIL_SMTP_URL",
          ...(isCloudflareSmtpUrl(environment.SMTP_URL) ? ["SMTP_URL"] : []),
        ])
      : firstDefined(environment, [scopedUrl, "SMTP_URL"]);

  if (!url) return null;

  const scopedTls = firstDefined(environment, [
    `PAPERBOY_SMTP_TLS_MODE_${token}`,
  ]);
  const scopedBounce = firstDefined(environment, [
    `PAPERBOY_BOUNCE_ADDRESS_${token}`,
  ]);
  const providerEnvironment: Record<string, string | undefined> = {
    SMTP_URL: url.value,
    SMTP_TLS_MODE:
      input.provider === "cloudflare-email"
        ? "required"
        : scopedTls?.value ?? environment.SMTP_TLS_MODE,
  };

  if (input.provider === "smtp") {
    providerEnvironment.PAPERBOY_BOUNCE_ADDRESS =
      scopedBounce?.value ?? environment.PAPERBOY_BOUNCE_ADDRESS;
  }

  return {
    environment: providerEnvironment,
    scope: url.name === scopedUrl ? "organization" : "operator-default",
  };
}

export function providerRuntimeStatus(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
  provider: LiveOutboundProvider;
}): ProviderRuntimeStatus {
  if (input.provider === "aws-ses" || input.provider === "azure-email") {
    return {
      configured: false,
      credentialScope: null,
      state: "adapter-unavailable",
    };
  }

  const configuration = providerSmtpConfiguration({
    environment: input.environment,
    orgId: input.orgId,
    provider: input.provider,
  });
  if (!configuration) {
    return {
      configured: false,
      credentialScope: null,
      state: "credentials-missing",
    };
  }

  try {
    const options = smtpTransportOptions(configuration.environment);
    if (
      input.provider === "cloudflare-email" &&
      (options.host?.toLowerCase() !== "smtp.mx.cloudflare.net" ||
        options.secure !== true ||
        options.port !== 465 ||
        options.auth?.user !== "api_token")
    ) {
      throw new Error("Invalid Cloudflare Email SMTP configuration.");
    }
  } catch {
    return {
      configured: false,
      credentialScope: configuration.scope,
      state: "configuration-invalid",
    };
  }

  return {
    configured: true,
    credentialScope: configuration.scope,
    state: "ready",
  };
}

export function requireProviderConfigured(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
  provider: LiveOutboundProvider;
}): ProviderRuntimeStatus {
  const status = providerRuntimeStatus(input);

  if (status.configured) return status;

  const code =
    status.state === "adapter-unavailable"
      ? "ADAPTER_UNAVAILABLE"
      : status.state === "configuration-invalid"
        ? "CONFIGURATION_INVALID"
        : "CREDENTIALS_MISSING";
  throw new OutboundProviderConfigurationError(code, input.provider);
}

export function providerConfigurationErrorMessage(
  error: OutboundProviderConfigurationError,
): string {
  const label = providerLabel(error.provider);
  if (error.code === "ADAPTER_UNAVAILABLE") {
    return `${label} is selectable, but this PaperBoy build does not include its delivery adapter yet.`;
  }
  if (error.code === "CONFIGURATION_INVALID") {
    return `The operator must correct the ${label} secret-store configuration.`;
  }
  if (error.code === "CONNECTION_FAILED") {
    return `${label} did not accept the provider connection test.`;
  }
  return `The operator must add ${label} credentials to the PaperBoy secret store.`;
}
