import Image from "next/image";
import Link from "next/link";
import paperboyBanner from "../../../docs/banner.jpg";
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
      <Image
        alt="PaperBoy — self-hosted transactional email"
        className="paperboy-logo-image"
        priority
        sizes={compact ? "120px" : "228px"}
        src={paperboyBanner}
      />
    </Link>
  );
}
