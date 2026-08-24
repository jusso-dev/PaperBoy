import { cn } from "@/lib/utils";

export function Tape({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("tape-strip", className)} />;
}
