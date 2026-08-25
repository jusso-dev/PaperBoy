import { CircleHelp, Send } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function DashboardHeader() {
  return (
    <header className="dashboard-page-header">
      <h1>Overview</h1>
      <div className="dashboard-page-actions">
        <Button
          asChild
          aria-label="Open PaperBoy documentation"
          className="dashboard-help-button"
          size="icon"
          variant="ghost-paper"
        >
          <Link href="https://github.com/jusso-dev/PaperBoy#readme" rel="noreferrer" target="_blank">
            <CircleHelp strokeWidth={1.6} />
          </Link>
        </Button>
        <Button asChild className="dashboard-docs-button" variant="paper">
          <Link href="https://github.com/jusso-dev/PaperBoy#readme" rel="noreferrer" target="_blank">
            Docs
          </Link>
        </Button>
        <Button asChild className="dashboard-send-button">
          <Link href="/app/send">
            Send Email
            <Send aria-hidden="true" strokeWidth={1.6} />
          </Link>
        </Button>
      </div>
    </header>
  );
}
