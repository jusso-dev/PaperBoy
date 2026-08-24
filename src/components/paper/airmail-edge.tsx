import { cn } from "@/lib/utils";

export function AirmailEdge({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("airmail-edge", className)}
    />
  );
}
