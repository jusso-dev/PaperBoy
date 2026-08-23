"use client";

import { useState } from "react";
import type {
  DnsCheckStatus,
  DomainDnsRecord,
} from "@/lib/domain-core";
import { copyExactDnsTxtValue } from "@/lib/dns-copy";

const checkLabels: Record<DnsCheckStatus, string> = {
  error: "Resolver error",
  matched: "Matched",
  missing: "Not found",
  pending: "Pending setup",
  unchecked: "Not checked",
};

export type DisplayDnsRecord = DomainDnsRecord & {
  check: DnsCheckStatus;
};

type CopyState = {
  recordId: string;
  status: "copied" | "failed";
} | null;

function recordId(record: DisplayDnsRecord): string {
  return `${record.key}:${record.name}:${record.selector ?? ""}`;
}

function requirement(record: DisplayDnsRecord): string {
  if (record.required) return "Required";
  if (record.key === "dkim" && record.value === null) return "Setup required";
  if (record.key === "dkim" && record.lifecycle === "retiring") {
    return "Keep during rotation";
  }
  if (record.key === "dkim") return "Rotation candidate";
  return "Recommended";
}

export function DnsRecordTable({
  domainName,
  records,
}: {
  domainName: string;
  records: DisplayDnsRecord[];
}) {
  const [copyState, setCopyState] = useState<CopyState>(null);

  async function copyValue(record: DisplayDnsRecord) {
    if (record.value === null) return;
    const id = recordId(record);

    try {
      await copyExactDnsTxtValue(record, (value) =>
        navigator.clipboard.writeText(value),
      );
      setCopyState({ recordId: id, status: "copied" });
    } catch {
      setCopyState({ recordId: id, status: "failed" });
    }
  }

  return (
    <div className="table-scroll">
      <table className="table dns-record-table">
        <caption>Records to publish for {domainName}</caption>
        <thead>
          <tr>
            <th scope="col">Purpose</th>
            <th scope="col">Type</th>
            <th scope="col">Host</th>
            <th scope="col">Value</th>
            <th scope="col">Status</th>
            <th scope="col">Copy</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const id = recordId(record);
            const feedback = copyState?.recordId === id ? copyState.status : null;

            return (
              <tr key={id}>
                <td>
                  <strong>{record.key.toUpperCase()}</strong>
                  <br />
                  <span className="dns-description">{record.description}</span>
                  <br />
                  <span className="dns-requirement">
                    {requirement(record)}
                  </span>
                </td>
                <td>{record.type}</td>
                <td>
                  <code>{record.name}</code>
                </td>
                <td>
                  {record.value !== null ? (
                    <code>{record.value}</code>
                  ) : (
                    <span className="dns-pending-value">
                      Generated during DKIM setup
                    </span>
                  )}
                </td>
                <td>
                  <span className={`dns-check dns-check-${record.check}`}>
                    {checkLabels[record.check]}
                  </span>
                </td>
                <td className="dns-copy-cell">
                  <button
                    aria-label={`Copy ${record.key.toUpperCase()} TXT value for ${record.name}`}
                    className="btn btn-compact"
                    disabled={record.value === null}
                    onClick={() => void copyValue(record)}
                    type="button"
                  >
                    Copy value
                  </button>
                  <span aria-live="polite" className="dns-copy-feedback">
                    {feedback === "copied"
                      ? "Copied exact TXT value."
                      : feedback === "failed"
                        ? "Clipboard unavailable. Select the value and copy it manually."
                        : record.value === null
                          ? "Available after setup."
                          : ""}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
