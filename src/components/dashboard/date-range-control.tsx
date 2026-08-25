"use client";

import { useTransition } from "react";
import { CalendarDays } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardRange } from "@/lib/dashboard";

export function DateRangeControl({
  label,
  range,
}: {
  label: string;
  range: DashboardRange;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function updateRange(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    next.set("range", value);
    startTransition(() => router.push(`${pathname}?${next.toString()}`));
  }

  return (
    <div className="date-range-control">
      <CalendarDays aria-hidden="true" strokeWidth={1.6} />
      <span className="date-range-label">{label}</span>
      <Select onValueChange={updateRange} value={String(range)}>
        <SelectTrigger
          aria-label="Dashboard reporting period"
          className="date-range-select"
          disabled={isPending}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="7">Last 7 days</SelectItem>
          <SelectItem value="14">Last 14 days</SelectItem>
          <SelectItem value="30">Last 30 days</SelectItem>
          <SelectItem value="all">All time</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
