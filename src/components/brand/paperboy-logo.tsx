import Link from "next/link";
import { cn } from "@/lib/utils";

function PaperboyMark() {
  return (
    <svg
      aria-hidden="true"
      className="paperboy-mark"
      fill="none"
      viewBox="0 0 86 78"
    >
      <path
        d="M22 26c1-12 9-19 21-20 12 0 20 7 22 18-11-3-31-2-43 2Z"
        fill="currentColor"
        opacity=".12"
      />
      <path
        d="M20 25c5-4 13-6 23-6 9 0 17 2 22 5M26 17c5-8 22-13 31-4l8 11M36 19l-1-9M57 18l-2-8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="M28 26v11c0 10 7 18 17 18 9 0 16-8 16-18V25M32 35c2-2 5-2 7 0m8 0c2-2 5-2 7 0M42 43c2 1 4 1 6 0"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <path
        d="M17 75c1-13 8-21 20-23l8 8 8-8c11 2 18 10 20 23M25 59l8 16m31-16-8 16"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <path
        d="m3 46 25-8 6 20-25 8z"
        fill="var(--paper-light)"
        stroke="currentColor"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path d="m5 48 25-8-8 12-17-4Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.4" />
      <path d="m33 40 16-7" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

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
      <PaperboyMark />
      <span className="paperboy-wordmark">
        <strong>PaperBoy</strong>
        {!compact ? <small>Transactional Email</small> : null}
      </span>
    </Link>
  );
}
