import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit items-center border px-2 py-0.5 font-mono text-[11px] font-semibold capitalize leading-none",
  {
    variants: {
      variant: {
        delivered: "border-postal-blue-light bg-sidebar text-postal-blue-dark",
        opened: "border-sidebar-muted bg-sidebar-muted/70 text-ink",
        clicked: "border-line bg-paper-dark text-ink",
        bounced: "border-airmail-red/50 bg-airmail-red/10 text-error",
        complained: "border-airmail-red/50 bg-airmail-red/10 text-error",
        deferred: "border-warning/40 bg-warning/10 text-warning",
        queued: "border-warning/40 bg-warning/10 text-warning",
        sending: "border-postal-blue/40 bg-postal-blue/10 text-postal-blue-dark",
        sent: "border-postal-blue-light bg-sidebar text-postal-blue-dark",
        failed: "border-error/50 bg-error/10 text-error",
        neutral: "border-line bg-paper-dark/60 text-ink-muted",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span
      className={cn(badgeVariants({ className, variant }))}
      data-slot="badge"
      {...props}
    />
  );
}

export { Badge, badgeVariants };
