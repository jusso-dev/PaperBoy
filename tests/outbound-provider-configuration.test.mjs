import assert from "node:assert/strict";
import test from "node:test";
import {
  OutboundProviderConfigurationError,
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
    ["aws-ses", "ADAPTER_UNAVAILABLE"],
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
