import { Mail, MoveRight } from "lucide-react";
import Link from "next/link";
import { Paperclip } from "@/components/paper/paperclip";
import { PaperCard } from "@/components/paper/paper-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DashboardEmail, DashboardEmailStatus } from "@/lib/dashboard";

function statusLabel(status: DashboardEmailStatus): string {
  if (status === "complained") return "Complaint";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function ageLabel(value: string, now: Date): string {
  const elapsed = Math.max(0, now.getTime() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function RecentEmails({ emails, now }: { emails: DashboardEmail[]; now: Date }) {
  return (
    <PaperCard className="recent-emails-panel">
      <Paperclip className="recent-emails-paperclip" />
      <header className="paper-panel-header recent-emails-header">
        <h2>Recent Emails</h2>
        <Link href="/app/logs">View all</Link>
      </header>

      {emails.length ? (
        <ol className="recent-email-list">
          {emails.map((email) => (
            <li key={email.id}>
              <Mail aria-hidden="true" className="recent-email-icon" strokeWidth={1.6} />
              <span className="recent-email-copy">
                <strong>{email.subject}</strong>
                <small>to: {email.recipient}</small>
              </span>
              <Badge variant={email.status}>{statusLabel(email.status)}</Badge>
              <time dateTime={email.createdAt}>{ageLabel(email.createdAt, now)}</time>
            </li>
          ))}
        </ol>
      ) : (
        <div className="postal-empty-state">
          <span>MAIL ROOM CLEAR</span>
          <p>No emails have been sent yet.</p>
          <Button asChild size="sm" variant="paper">
            <Link href="/app/send">
              Send an email
              <MoveRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      )}
    </PaperCard>
  );
}
