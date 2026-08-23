import assert from "node:assert/strict";
import test from "node:test";
import {
  OutboundProviderConfigurationError,
  organizationAwsSesVariable,
  organizationProviderSecretVariable,
  providerConfigurationErrorMessage,
  providerRuntimeStatus,
  requireProviderConfigured,
} from "../src/lib/outbound-provider-configuration.ts";

const orgId = "11111111-1111-4111-8111-111111111111";

test("SMTP credentials resolve from an organization secret before the default", () => {
  const scoped = organizationProviderSecretVariable(orgId, "smtp");
  const status = providerRuntimeStatus({
    environment: {
      [scoped]: "smtp://user:test-token@mail.example.com:587",
      SMTP_URL: "smtp://user:secret@mail.example.net:587",
    },
    orgId,
    provider: "smtp",
  });

  assert.deepEqual(status, {
    configured: true,
    credentialScope: "organization",
    state: "ready",
  });
  assert.equal(JSON.stringify(status).includes("secret"), false);
});

test("Cloudflare Email requires its API-token SMTP endpoint", () => {
  const cloudflareUrl =
    "smtps://api_token:test-token@smtp.mx.cloudflare.net:465";
  assert.deepEqual(
    providerRuntimeStatus({
      environment: { CLOUDFLARE_EMAIL_SMTP_URL: cloudflareUrl },
      orgId,
      provider: "cloudflare-email",
    }),
    {
      configured: true,
      credentialScope: "operator-default",
      state: "ready",
    },
  );
  assert.deepEqual(
    providerRuntimeStatus({
      environment: { SMTP_URL: cloudflareUrl },
      orgId,
      provider: "cloudflare-email",
    }),
    {
      configured: true,
      credentialScope: "operator-default",
      state: "ready",
    },
  );
  const scoped = organizationProviderSecretVariable(
    orgId,
    "cloudflare-email",
  );
  assert.deepEqual(
    providerRuntimeStatus({
      environment: {
        CLOUDFLARE_EMAIL_SMTP_URL: "smtp://mail.example.com",
        [scoped]: cloudflareUrl,
      },
      orgId,
      provider: "cloudflare-email",
    }),
    {
      configured: true,
      credentialScope: "organization",
      state: "ready",
    },
  );
  assert.equal(
    providerRuntimeStatus({
      environment: { CLOUDFLARE_EMAIL_SMTP_URL: "smtp://mail.example.com" },
      orgId,
      provider: "cloudflare-email",
    }).state,
    "configuration-invalid",
  );
});

test("missing credentials and unavailable adapters fail closed without secret values", () => {
  for (const [provider, code] of [
    ["smtp", "CREDENTIALS_MISSING"],
    ["aws-ses", "CREDENTIALS_MISSING"],
    ["azure-email", "ADAPTER_UNAVAILABLE"],
  ]) {
    assert.throws(
      () => requireProviderConfigured({ environment: {}, orgId, provider }),
      (error) => {
        assert.ok(error instanceof OutboundProviderConfigurationError);
        assert.equal(error.code, code);
        assert.equal(providerConfigurationErrorMessage(error).includes("secret-value"), false);
        return true;
      },
    );
  }
});

test("Amazon SES resolves per-organization region and access-key credentials", () => {
  const environment = {
    [organizationAwsSesVariable(orgId, "ACCESS_KEY_ID")]:
      "TESTSESACCESSKEY01",
    [organizationAwsSesVariable(orgId, "CONFIGURATION_SET")]:
      "paperboy-events",
    [organizationAwsSesVariable(orgId, "REGION")]: "ap-southeast-2",
    [organizationAwsSesVariable(orgId, "SECRET_ACCESS_KEY")]:
      "fixture-secret-access-key",
    [organizationAwsSesVariable(orgId, "SNS_TOPIC_ARN")]:
      "arn:aws:sns:ap-southeast-2:123456789012:paperboy-ses-events",
    AWS_SES_ACCESS_KEY_ID: "TESTSESDEFAULTKEY01",
    AWS_SES_REGION: "us-east-1",
    AWS_SES_SECRET_ACCESS_KEY: "operator-default-secret",
  };
  const status = providerRuntimeStatus({
    environment,
    orgId,
    provider: "aws-ses",
  });

  assert.deepEqual(status, {
    configured: true,
    credentialScope: "organization",
    state: "ready",
  });
  assert.equal(JSON.stringify(status).includes("fixture-secret"), false);
});

test("Amazon SES supports an organization IAM role and rejects partial keys", () => {
  assert.deepEqual(
    providerRuntimeStatus({
      environment: {
        [organizationAwsSesVariable(orgId, "REGION")]: "us-gov-west-1",
        [organizationAwsSesVariable(orgId, "ROLE_ARN")]:
          "arn:aws-us-gov:iam::123456789012:role/paperboy-ses",
      },
      orgId,
      provider: "aws-ses",
    }),
    {
      configured: true,
      credentialScope: "organization",
      state: "ready",
    },
  );
  assert.equal(
    providerRuntimeStatus({
      environment: {
        [organizationAwsSesVariable(orgId, "ACCESS_KEY_ID")]:
          "TESTSESACCESSKEY01",
        [organizationAwsSesVariable(orgId, "REGION")]: "us-east-1",
      },
      orgId,
      provider: "aws-ses",
    }).state,
    "configuration-invalid",
  );
});
