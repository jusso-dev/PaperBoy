import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SPF_RECORD,
  buildDomainDnsRecords,
  decideDkimVerification,
  domainDeliveryMode,
  normalizeDnsChecks,
  normalizeSendingDomain,
  verifyDomainDns,
} from "../src/lib/domain-core.ts";

test("sending domains are canonical ASCII hostnames", () => {
  assert.equal(normalizeSendingDomain(" Mail.Example.COM. "), "mail.example.com");
  assert.equal(normalizeSendingDomain("münchen.example"), "xn--mnchen-3ya.example");
  assert.equal(normalizeSendingDomain("https://example.com"), null);
  assert.equal(normalizeSendingDomain("user@example.com"), null);
  assert.equal(normalizeSendingDomain("*.example.com"), null);
  assert.equal(normalizeSendingDomain("127.0.0.1"), null);
  assert.equal(normalizeSendingDomain("localhost"), null);
  assert.equal(normalizeSendingDomain("bad_label.example"), null);
});

test("DNS instructions are deterministic and do not fake DKIM material", () => {
  const records = buildDomainDnsRecords({
    domain: "mail.example.com",
    verificationToken: "11111111-1111-4111-8111-111111111111",
  });

  assert.deepEqual(
    records.map(({ key, name, required, value }) => ({
      key,
      name,
      required,
      value,
    })),
    [
      {
        key: "ownership",
        name: "_paperboy.mail.example.com",
        required: true,
        value:
          "paperboy-verification=11111111-1111-4111-8111-111111111111",
      },
      {
        key: "spf",
        name: "mail.example.com",
        required: true,
        value: DEFAULT_SPF_RECORD,
      },
      {
        key: "dkim",
        name: "paperboy._domainkey.mail.example.com",
        required: false,
        value: null,
      },
      {
        key: "dmarc",
        name: "_dmarc.mail.example.com",
        required: false,
        value:
          "v=DMARC1; p=none; rua=mailto:dmarc@mail.example.com",
      },
    ],
  );
});

test("verification joins chunked TXT answers and requires ownership plus SPF", async () => {
  const records = buildDomainDnsRecords({
    domain: "example.com",
    verificationToken: "token",
  });
  const fixtures = new Map([
    ["_paperboy.example.com", [["paperboy-", "verification=token"]]],
    ["example.com", [["v=spf1 mx ", "~all"]]],
    ["_dmarc.example.com", [["v=DMARC1; p=none"]]],
  ]);
  const result = await verifyDomainDns(records, async (hostname) => {
    const answer = fixtures.get(hostname);

    if (!answer) {
      const error = new Error("missing");
      error.code = "ENODATA";
      throw error;
    }

    return answer;
  });

  assert.equal(result.verified, true);
  assert.deepEqual(result.checks, {
    dkim: "pending",
    dmarc: "missing",
    ownership: "matched",
    spf: "matched",
  });
});

test("a configured PaperBoy DKIM selector is required and remains distinct", async () => {
  const records = buildDomainDnsRecords({
    dkim: {
      selector: "pb20260823a1b2c3d4",
      value: "v=DKIM1; k=rsa; p=public-key",
    },
    domain: "example.com",
    spfValue: "v=spf1 mx include:_spf.mx.cloudflare.net ~all",
    verificationToken: "token",
  });
  const dkim = records.find((record) => record.key === "dkim");

  assert.equal(dkim.required, true);
  assert.equal(
    dkim.name,
    "pb20260823a1b2c3d4._domainkey.example.com",
  );
  assert.equal(dkim.name.startsWith("cf-bounce."), false);
  assert.equal(
    records.find((record) => record.key === "spf").value,
    "v=spf1 mx include:_spf.mx.cloudflare.net ~all",
  );

  const result = await verifyDomainDns(records, async (hostname) => {
    if (hostname === dkim.name) {
      const error = new Error("missing");
      error.code = "ENODATA";
      throw error;
    }

    const record = records.find((candidate) => candidate.name === hostname);
    return [[record.value]];
  });

  assert.equal(result.verified, false);
  assert.equal(result.checks.dkim, "missing");
});

test("resolver failures remain distinct from missing DNS", async () => {
  const records = buildDomainDnsRecords({
    domain: "example.com",
    verificationToken: "token",
  });
  const result = await verifyDomainDns(records, async (hostname) => {
    const error = new Error("resolver unavailable");
    error.code = hostname.startsWith("_dmarc") ? "ENOTFOUND" : "ETIMEOUT";
    throw error;
  });

  assert.equal(result.verified, false);
  assert.equal(result.checks.ownership, "error");
  assert.equal(result.checks.spf, "error");
  assert.equal(result.checks.dmarc, "missing");
});

test("stored DNS snapshots are narrowed defensively", () => {
  assert.deepEqual(normalizeDnsChecks({ ownership: "matched", spf: "oops" }), {
    dkim: "pending",
    dmarc: "unchecked",
    ownership: "matched",
    spf: "unchecked",
  });
});

test("live delivery requires verification while test delivery always sinks", () => {
  assert.equal(domainDeliveryMode("live", "verified", true), "live");
  assert.equal(domainDeliveryMode("live", "verified", false), "blocked");
  assert.equal(domainDeliveryMode("live", "pending", true), "blocked");
  assert.equal(domainDeliveryMode("test", "pending"), "test-sink");
  assert.equal(domainDeliveryMode("test", null), "test-sink");
  assert.equal(domainDeliveryMode("unknown", "verified"), "blocked");
});

test("DKIM rotation keeps a matched active selector live until replacement matches", () => {
  assert.deepEqual(
    decideDkimVerification({
      active: "matched",
      infrastructureMatched: true,
      pending: "missing",
    }),
    { activatePending: false, dkimCheck: "matched", verified: true },
  );
  assert.deepEqual(
    decideDkimVerification({
      active: "matched",
      infrastructureMatched: true,
      pending: "matched",
    }),
    { activatePending: true, dkimCheck: "matched", verified: true },
  );
  assert.deepEqual(
    decideDkimVerification({
      active: null,
      infrastructureMatched: true,
      pending: "missing",
    }),
    { activatePending: false, dkimCheck: "missing", verified: false },
  );
});
