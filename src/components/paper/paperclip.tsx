import { cn } from "@/lib/utils";

export function Paperclip({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("paperclip", className)} />;
}
