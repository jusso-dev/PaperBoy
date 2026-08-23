import { isIP } from "node:net";
import { domainToASCII } from "node:url";

export const DOMAIN_STATUSES = ["pending", "verified"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

export type DomainErrorCode =
  | "DNS_CONFIGURATION_INVALID"
  | "DOMAIN_EXISTS"
  | "DOMAIN_NOT_FOUND"
  | "DOMAIN_NOT_VERIFIED"
  | "INVALID_DOMAIN"
  | "MEMBERSHIP_REQUIRED";

export class DomainError extends Error {
  constructor(readonly code: DomainErrorCode) {
    super(code);
    this.name = "DomainError";
  }
}

export const DNS_CHECK_STATUSES = [
  "unchecked",
  "matched",
  "missing",
  "error",
  "pending",
] as const;
export type DnsCheckStatus = (typeof DNS_CHECK_STATUSES)[number];

export type DomainDnsCheckSnapshot = {
  dkim: DnsCheckStatus;
  dmarc: DnsCheckStatus;
  ownership: DnsCheckStatus;
  spf: DnsCheckStatus;
};

export type DomainDnsRecordKey = keyof DomainDnsCheckSnapshot;

export type DomainDnsRecord = {
  description: string;
  key: DomainDnsRecordKey;
  lifecycle?: "active" | "pending" | "retired" | "retiring";
  name: string;
  required: boolean;
  selector?: string;
  status?: DnsCheckStatus;
  type: "TXT";
  value: string | null;
};

export type TxtResolver = (hostname: string) => Promise<string[][]>;

export const DEFAULT_SPF_RECORD = "v=spf1 mx ~all";

export const EMPTY_DNS_CHECKS: DomainDnsCheckSnapshot = {
  dkim: "pending",
  dmarc: "unchecked",
  ownership: "unchecked",
  spf: "unchecked",
};

export function isDomainStatus(value: unknown): value is DomainStatus {
  return (
    typeof value === "string" &&
    DOMAIN_STATUSES.includes(value as DomainStatus)
  );
}

export function isDnsCheckStatus(value: unknown): value is DnsCheckStatus {
  return (
    typeof value === "string" &&
    DNS_CHECK_STATUSES.includes(value as DnsCheckStatus)
  );
}

export function normalizeSendingDomain(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const input = value.trim().toLowerCase().replace(/\.$/, "");

  if (
    input.length === 0 ||
    input.length > 253 ||
    input.includes("://") ||
    input.includes("/") ||
    input.includes("@") ||
    input.includes(":") ||
    input.startsWith("*.")
  ) {
    return null;
  }

  const ascii = domainToASCII(input);

  if (!ascii || isIP(ascii) !== 0) {
    return null;
  }

  const labels = ascii.split(".");

  if (
    labels.length < 2 ||
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label),
    )
  ) {
    return null;
  }

  return ascii;
}

export function normalizeDnsChecks(
  value: unknown,
): DomainDnsCheckSnapshot {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_DNS_CHECKS };
  }

  const checks = value as Partial<DomainDnsCheckSnapshot>;

  return {
    dkim: isDnsCheckStatus(checks.dkim) ? checks.dkim : "pending",
    dmarc: isDnsCheckStatus(checks.dmarc) ? checks.dmarc : "unchecked",
    ownership: isDnsCheckStatus(checks.ownership)
      ? checks.ownership
      : "unchecked",
    spf: isDnsCheckStatus(checks.spf) ? checks.spf : "unchecked",
  };
}

export function starterDmarcRecord(domain: string): string {
  return `v=DMARC1; p=none; rua=mailto:dmarc@${domain}`;
}

export function buildDomainDnsRecords(input: {
  domain: string;
  dkim?: { selector: string; value: string } | null;
  spfValue?: string;
  verificationToken: string;
}): DomainDnsRecord[] {
  const spfValue = input.spfValue ?? DEFAULT_SPF_RECORD;

  return [
    {
      description: "Proves control of this domain to PaperBoy.",
      key: "ownership",
      name: `_paperboy.${input.domain}`,
      required: true,
      type: "TXT",
      value: `paperboy-verification=${input.verificationToken}`,
    },
    {
      description:
        "Authorises this domain's configured outbound sending hosts. Publish only one SPF record at this name.",
      key: "spf",
      name: input.domain,
      required: true,
      type: "TXT",
      value: spfValue,
    },
    buildDkimDnsRecord({
      domain: input.domain,
      required: Boolean(input.dkim),
      selector: input.dkim?.selector,
      value: input.dkim?.value ?? null,
    }),
    {
      description:
        "Starts DMARC in monitoring mode. Confirm the reporting mailbox exists before publishing.",
      key: "dmarc",
      name: `_dmarc.${input.domain}`,
      required: false,
      type: "TXT",
      value: starterDmarcRecord(input.domain),
    },
  ];
}

export function buildDkimDnsRecord(input: {
  description?: string;
  domain: string;
  lifecycle?: "active" | "pending" | "retired" | "retiring";
  required: boolean;
  selector?: string;
  status?: DnsCheckStatus;
  value: string | null;
}): DomainDnsRecord {
  return {
    description:
      input.description ??
      (input.value
        ? "Publishes the public key used to sign PaperBoy mail."
        : "Reserved for PaperBoy signing. The publishable value appears after DKIM setup."),
    key: "dkim",
    lifecycle: input.lifecycle,
    name: `${input.selector ?? "paperboy"}._domainkey.${input.domain}`,
    required: input.required,
    selector: input.selector,
    status: input.status,
    type: "TXT",
    value: input.value,
  };
}

function statusFromDnsError(error: unknown): DnsCheckStatus {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return "error";
  }

  const code = String(error.code);
  return ["ENODATA", "ENOTFOUND", "NODATA", "NOTFOUND"].includes(code)
    ? "missing"
    : "error";
}

export async function checkDomainDnsRecord(
  record: DomainDnsRecord,
  resolveTxt: TxtResolver,
): Promise<DnsCheckStatus> {
  if (!record.value) {
    return "pending";
  }

  try {
    const answers = await resolveTxt(record.name);
    const values = answers.map((chunks) => chunks.join("").trim());
    return values.includes(record.value) ? "matched" : "missing";
  } catch (error) {
    return statusFromDnsError(error);
  }
}

export async function verifyDomainDns(
  records: DomainDnsRecord[],
  resolveTxt: TxtResolver,
) {
  const results = await Promise.all(
    records.map(async (record) => [
      record.key,
      await checkDomainDnsRecord(record, resolveTxt),
    ] as const),
  );
  const checks = normalizeDnsChecks(Object.fromEntries(results));
  const verified = records
    .filter((record) => record.required)
    .every((record) => checks[record.key] === "matched");

  return { checks, verified };
}

export function decideDkimVerification(input: {
  active: DnsCheckStatus | null;
  infrastructureMatched: boolean;
  pending: DnsCheckStatus | null;
}) {
  const activatePending =
    input.infrastructureMatched && input.pending === "matched";
  const verified =
    input.infrastructureMatched &&
    (activatePending || input.active === "matched");
  const dkimCheck = activatePending
    ? "matched"
    : input.active ?? input.pending ?? "pending";

  return { activatePending, dkimCheck, verified };
}

export type DomainDeliveryMode = "blocked" | "live" | "test-sink";

export function domainDeliveryMode(
  environment: unknown,
  status: unknown,
  hasActiveDkim: boolean = false,
): DomainDeliveryMode {
  if (environment === "test") {
    return "test-sink";
  }

  return environment === "live" && status === "verified" && hasActiveDkim
    ? "live"
    : "blocked";
}
