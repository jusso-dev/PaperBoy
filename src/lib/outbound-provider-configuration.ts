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

export type AwsSesStaticCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
};

export type AwsSesCredentialSource =
  | { kind: "access-key"; credentials: AwsSesStaticCredentials }
  | { kind: "default-chain" }
  | {
      externalId?: string;
      kind: "assume-role";
      roleArn: string;
      sourceCredentials?: AwsSesStaticCredentials;
    };

export type ProviderAwsSesConfiguration = {
  configurationSetName: string | null;
  credentials: AwsSesCredentialSource;
  region: string;
  scope: ProviderCredentialScope;
  snsTopicArn: string | null;
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

export function organizationAwsSesVariable(
  orgId: string,
  suffix:
    | "ACCESS_KEY_ID"
    | "CONFIGURATION_SET"
    | "EXTERNAL_ID"
    | "REGION"
    | "ROLE_ARN"
    | "SECRET_ACCESS_KEY"
    | "SESSION_TOKEN"
    | "SNS_TOPIC_ARN",
): string {
  return `PAPERBOY_AWS_SES_${suffix}_${organizationToken(orgId)}`;
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

function exactValue(
  entry: { name: string; value: string | undefined } | null,
): string | null {
  if (!entry) return null;
  if (
    typeof entry.value !== "string" ||
    entry.value.length === 0 ||
    entry.value !== entry.value.trim() ||
    /[\u0000-\u001f\u007f]/.test(entry.value)
  ) {
    throw new Error(`${entry.name} is invalid.`);
  }
  return entry.value;
}

function optionalExactValue(
  entry: { name: string; value: string | undefined } | null,
): string | null {
  return entry ? exactValue(entry) : null;
}

function staticAwsCredentials(input: {
  accessKey: { name: string; value: string | undefined } | null;
  secretKey: { name: string; value: string | undefined } | null;
  sessionToken: { name: string; value: string | undefined } | null;
}): AwsSesStaticCredentials | null {
  const accessKeyId = optionalExactValue(input.accessKey);
  const secretAccessKey = optionalExactValue(input.secretKey);
  const sessionToken = optionalExactValue(input.sessionToken);

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error("Amazon SES access-key credentials are incomplete.");
  }
  if (!accessKeyId || !secretAccessKey) {
    if (sessionToken) {
      throw new Error("Amazon SES session tokens require an access-key pair.");
    }
    return null;
  }
  if (!/^[A-Z0-9]{16,128}$/.test(accessKeyId)) {
    throw new Error("Amazon SES access key ID is invalid.");
  }
  if (secretAccessKey.length < 16 || secretAccessKey.length > 256) {
    throw new Error("Amazon SES secret access key is invalid.");
  }
  if (sessionToken && (sessionToken.length < 16 || sessionToken.length > 4096)) {
    throw new Error("Amazon SES session token is invalid.");
  }
  return {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {}),
  };
}

function awsSesCredentialEntries(input: {
  environment: Readonly<Record<string, string | undefined>>;
  orgId: string;
}) {
  const suffixes = [
    "ACCESS_KEY_ID",
    "SECRET_ACCESS_KEY",
    "SESSION_TOKEN",
    "ROLE_ARN",
    "EXTERNAL_ID",
  ] as const;
  const scoped = Object.fromEntries(
    suffixes.map((suffix) => {
      const name = organizationAwsSesVariable(input.orgId, suffix);
      return [suffix, firstDefined(input.environment, [name])];
    }),
  ) as Record<(typeof suffixes)[number], ReturnType<typeof firstDefined>>;
  const hasScopedCredential = Object.values(scoped).some(Boolean);

  if (hasScopedCredential) {
    return { entries: scoped, scope: "organization" as const };
  }

  return {
    entries: {
      ACCESS_KEY_ID: firstDefined(input.environment, [
        "AWS_SES_ACCESS_KEY_ID",
        "AWS_ACCESS_KEY_ID",
      ]),
      EXTERNAL_ID: firstDefined(input.environment, ["AWS_SES_EXTERNAL_ID"]),
      ROLE_ARN: firstDefined(input.environment, ["AWS_SES_ROLE_ARN"]),
      SECRET_ACCESS_KEY: firstDefined(input.environment, [
        "AWS_SES_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
      ]),
      SESSION_TOKEN: firstDefined(input.environment, [
        "AWS_SES_SESSION_TOKEN",
        "AWS_SESSION_TOKEN",
      ]),
    },
    scope: "operator-default" as const,
  };
}

export function providerAwsSesConfiguration(input: {
  environment?: Readonly<Record<string, string | undefined>>;
  orgId: string;
}): ProviderAwsSesConfiguration | null {
  const environment = input.environment ?? process.env;
  const regionEntry = firstDefined(environment, [
    organizationAwsSesVariable(input.orgId, "REGION"),
    "AWS_SES_REGION",
    "AWS_REGION",
  ]);
  const region = optionalExactValue(regionEntry);
  const credentialSelection = awsSesCredentialEntries({
    environment,
    orgId: input.orgId,
  });
  const entries = credentialSelection.entries;
  const staticCredentials = staticAwsCredentials({
    accessKey: entries.ACCESS_KEY_ID,
    secretKey: entries.SECRET_ACCESS_KEY,
    sessionToken: entries.SESSION_TOKEN,
  });
  const roleArn = optionalExactValue(entries.ROLE_ARN);
  const externalId = optionalExactValue(entries.EXTERNAL_ID);
  const defaultChainEntry = firstDefined(environment, [
    "AWS_SES_USE_DEFAULT_CREDENTIAL_CHAIN",
  ]);
  const defaultChainValue = defaultChainEntry?.value;

  if (
    defaultChainValue !== undefined &&
    defaultChainValue !== "true" &&
    defaultChainValue !== "false"
  ) {
    throw new Error(
      "AWS_SES_USE_DEFAULT_CREDENTIAL_CHAIN must be true or false.",
    );
  }
  if (externalId && !roleArn) {
    throw new Error("Amazon SES external ID requires an IAM role ARN.");
  }
  if (
    roleArn &&
    !/^arn:(?:aws|aws-cn|aws-us-gov):iam::[0-9]{12}:role\/[A-Za-z0-9_+=,.@\/-]{1,512}$/.test(
      roleArn,
    )
  ) {
    throw new Error("Amazon SES IAM role ARN is invalid.");
  }
  if (
    externalId &&
    (externalId.length < 2 ||
      externalId.length > 1224 ||
      !/^[A-Za-z0-9_+=,.@:\/-]+$/.test(externalId))
  ) {
    throw new Error("Amazon SES external ID is invalid.");
  }

  const hasDefaultChain = defaultChainValue === "true";
  if (!region || (!roleArn && !staticCredentials && !hasDefaultChain)) {
    return null;
  }
  if (region.length > 32 || !/^[a-z]{2}(?:-[a-z0-9]+)+-[0-9]$/.test(region)) {
    throw new Error("Amazon SES region is invalid.");
  }

  const configurationSetName = optionalExactValue(
    firstDefined(environment, [
      organizationAwsSesVariable(input.orgId, "CONFIGURATION_SET"),
      "AWS_SES_CONFIGURATION_SET",
    ]),
  );
  if (
    configurationSetName &&
    !/^[A-Za-z0-9_-]{1,64}$/.test(configurationSetName)
  ) {
    throw new Error("Amazon SES configuration-set name is invalid.");
  }

  const snsTopicArn = optionalExactValue(
    firstDefined(environment, [
      organizationAwsSesVariable(input.orgId, "SNS_TOPIC_ARN"),
      "AWS_SES_SNS_TOPIC_ARN",
    ]),
  );
  if (
    snsTopicArn &&
    !new RegExp(
      `^arn:(?:aws|aws-cn|aws-us-gov):sns:${region}:[0-9]{12}:[A-Za-z0-9_-]{1,256}$`,
    ).test(snsTopicArn)
  ) {
    throw new Error("Amazon SES SNS topic ARN is invalid for its region.");
  }

  const credentials: AwsSesCredentialSource = roleArn
    ? {
        ...(externalId ? { externalId } : {}),
        kind: "assume-role",
        roleArn,
        ...(staticCredentials ? { sourceCredentials: staticCredentials } : {}),
      }
    : staticCredentials
      ? { credentials: staticCredentials, kind: "access-key" }
      : { kind: "default-chain" };

  return {
    configurationSetName,
    credentials,
    region,
    scope: credentialSelection.scope,
    snsTopicArn,
  };
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
  if (input.provider === "azure-email") {
    return {
      configured: false,
      credentialScope: null,
      state: "adapter-unavailable",
    };
  }

  if (input.provider === "aws-ses") {
    try {
      const configuration = providerAwsSesConfiguration(input);
      if (!configuration) {
        return {
          configured: false,
          credentialScope: null,
          state: "credentials-missing",
        };
      }
      return {
        configured: true,
        credentialScope: configuration.scope,
        state: "ready",
      };
    } catch {
      return {
        configured: false,
        credentialScope: null,
        state: "configuration-invalid",
      };
    }
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
