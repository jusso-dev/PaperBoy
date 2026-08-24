import Link from "next/link";
import { cn } from "@/lib/utils";

export function PaperboyLogo({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      aria-label="PaperBoy dashboard"
      className={cn("paperboy-logo", compact && "paperboy-logo-compact", className)}
      href="/app"
    >
      <span aria-hidden="true" className="paperboy-logo-image" />
      <span className="sr-only">PaperBoy — self-hosted transactional email</span>
    </Link>
  );
}
