import { cn } from "@/lib/utils";

export function Paperclip({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn("paperclip", className)}
      fill="none"
      viewBox="0 0 34 88"
    >
      <path
        d="M22.9 78.3 8.1 25.4C5.4 15.7 9.2 7.1 16.2 5.2c7-2 13.6 3.5 16.3 13.2l-13 46.5c-1.5 5.5-5 8.4-8.4 7.4-3.4-.9-4.8-5.2-3.2-10.7l10.2-36.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <path
        d="m19.8 83.1-15-53.5"
        opacity=".45"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1"
      />
    </svg>
  );
}
