import assert from "node:assert/strict";
import test from "node:test";
import {
  providerVerifiedSenderDomains,
  readySenderDomains,
} from "../src/lib/provider-sender-identities.ts";

const orgId = "11111111-1111-4111-8111-111111111111";

test("SES sender identities come from sending-enabled verified provider domains", async () => {
  const domains = await providerVerifiedSenderDomains({
    orgId,
    provider: "aws-ses",
    async testConnection() {
      return {
        accountMode: "production",
        region: "ap-southeast-2",
        sendingEnabled: true,
        verifiedDomains: ["YUMAIT.AU", "rangeros.com.au", "yumait.au", "invalid"],
      };
    },
  });

  assert.deepEqual(domains, ["rangeros.com.au", "yumait.au"]);
});

test("disabled provider account exposes no sender identities", async () => {
  const domains = await providerVerifiedSenderDomains({
    orgId,
    provider: "aws-ses",
    async testConnection() {
      return {
        accountMode: "sandbox",
        region: "ap-southeast-2",
        sendingEnabled: false,
        verifiedDomains: ["yumait.au"],
      };
    },
  });

  assert.deepEqual(domains, []);
});

test("SES provider identities are ready without PaperBoy DNS records", async () => {
  const domains = await readySenderDomains({
    defaultProvider: "aws-ses",
    domains: [],
    orgId,
    providerDomains: [],
    async testConnection() {
      return {
        accountMode: "production",
        region: "ap-southeast-2",
        sendingEnabled: true,
        verifiedDomains: ["rangeros.com.au", "yumait.au"],
      };
    },
  });

  assert.deepEqual(domains, ["rangeros.com.au", "yumait.au"]);
});

test("SES overrides expose only matching local identities", async () => {
  const domains = await readySenderDomains({
    defaultProvider: "smtp",
    domains: [
      {
        dkimKeys: [{ status: "active" }],
        id: "ses-domain",
        name: "yumait.au",
        status: "verified",
      },
    ],
    orgId,
    providerDomains: [
      { effectiveProvider: "aws-ses", id: "ses-domain" },
    ],
    async testConnection() {
      return {
        accountMode: "production",
        region: "ap-southeast-2",
        sendingEnabled: true,
        verifiedDomains: ["rangeros.com.au", "yumait.au"],
      };
    },
  });

  assert.deepEqual(domains, ["yumait.au"]);
});
