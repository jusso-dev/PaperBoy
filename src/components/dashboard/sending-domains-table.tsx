import { Check, Clock3, Ellipsis, X } from "lucide-react";
import Link from "next/link";
import { PaperCard } from "@/components/paper/paper-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { DashboardDomain } from "@/lib/dashboard";

function dnsLabel(value: string): string {
  if (value === "matched") return "Pass";
  if (value === "missing") return "Missing";
  if (value === "error") return "Error";
  if (value === "pending") return "Pending";
  return "Not checked";
}

function DnsState({ matchedLabel = "Pass", value }: { matchedLabel?: string; value: string }) {
  const matched = value === "matched";
  const failed = value === "missing" || value === "error";
  const Icon = matched ? Check : failed ? X : Clock3;

  return (
    <span className={matched ? "dns-state is-pass" : failed ? "dns-state is-fail" : "dns-state"}>
      <Icon aria-hidden="true" strokeWidth={1.8} />
      {matched ? matchedLabel : dnsLabel(value)}
    </span>
  );
}

function formatLastUsed(value: string | null, timeZone: string): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone,
    year: "numeric",
  }).format(new Date(value));
}

export function SendingDomainsTable({
  domains,
  timeZone,
}: {
  domains: DashboardDomain[];
  timeZone: string;
}) {
  return (
    <PaperCard className="sending-domains-panel">
      <header className="sending-domains-header">
        <div>
          <h2>Sending Domains</h2>
          <p>DNS and live-send readiness. Times use {timeZone}.</p>
        </div>
        <Button asChild variant="paper">
          <Link href="/app/organization">Provider settings</Link>
        </Button>
      </header>

      {domains.length ? (
        <Table className="domains-ledger">
          <TableHeader>
            <TableRow>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>DNS status</TableHead>
              <TableHead>SPF</TableHead>
              <TableHead>DKIM</TableHead>
              <TableHead>DMARC</TableHead>
              <TableHead>Last used</TableHead>
              <TableHead><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {domains.map((domain) => (
              <TableRow key={domain.id}>
                <TableCell className="domain-name-cell">
                  <Link href="/app/organization">{domain.name}</Link>
                </TableCell>
                <TableCell>
                  <Badge variant={domain.status === "active" ? "delivered" : "queued"}>
                    {domain.status}
                  </Badge>
                </TableCell>
                <TableCell><DnsState matchedLabel="Verified" value={domain.dns} /></TableCell>
                <TableCell><DnsState value={domain.spf} /></TableCell>
                <TableCell><DnsState value={domain.dkim} /></TableCell>
                <TableCell><DnsState value={domain.dmarc} /></TableCell>
                <TableCell>{formatLastUsed(domain.lastUsedAt, timeZone)}</TableCell>
                <TableCell>
                  <Button asChild aria-label={`Open ${domain.name}`} size="icon" variant="ghost-paper">
                    <Link href="/app/organization">
                      <Ellipsis strokeWidth={1.6} />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <div className="postal-empty-state domains-empty-state">
          <span>ADDRESS UNKNOWN</span>
          <p>No sending domains are configured.</p>
          <Button asChild size="sm" variant="paper">
            <Link href="/app/organization">Check provider identities</Link>
          </Button>
        </div>
      )}
    </PaperCard>
  );
}
