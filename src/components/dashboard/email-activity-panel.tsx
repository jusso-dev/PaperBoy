"use client";

import { useMemo, useState } from "react";
import { EmailActivityChart } from "@/components/dashboard/email-activity-chart";
import { PaperCard } from "@/components/paper/paper-card";
import { Tape } from "@/components/paper/tape";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DashboardActivityPoint, DashboardBucket } from "@/lib/dashboard";

const legend = [
  { className: "legend-delivered", label: "Delivered" },
  { className: "legend-opened", label: "Opened" },
  { className: "legend-clicked", label: "Clicked" },
];

export function EmailActivityPanel({
  bucket,
  data,
}: {
  bucket: DashboardBucket;
  data: DashboardActivityPoint[];
}) {
  const [granularity, setGranularity] = useState<"daily" | "weekly">("daily");
  const chartData = useMemo(() => {
    if (bucket === "month" || granularity === "daily") return data;

    const points: DashboardActivityPoint[] = [];
    for (let index = 0; index < data.length; index += 7) {
      const group = data.slice(index, index + 7);
      const first = group[0];
      const last = group.at(-1);
      if (!first || !last) continue;
      points.push({
        clicked: group.reduce((total, point) => total + point.clicked, 0),
        date: first.date === last.date ? first.date : `${first.date}–${last.date}`,
        delivered: group.reduce((total, point) => total + point.delivered, 0),
        opened: group.reduce((total, point) => total + point.opened, 0),
      });
    }
    return points;
  }, [bucket, data, granularity]);

  return (
    <PaperCard className="activity-panel">
      <Tape className="activity-panel-tape" />
      <header className="paper-panel-header">
        <h2>Email Activity</h2>
        {bucket === "day" ? (
          <Select
            onValueChange={(value) => setGranularity(value as "daily" | "weekly")}
            value={granularity}
          >
            <SelectTrigger aria-label="Chart granularity" className="paper-select-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="daily">Daily</SelectItem>
              <SelectItem value="weekly">Weekly</SelectItem>
            </SelectContent>
          </Select>
        ) : (
          <span className="paper-select-label activity-bucket-label">Monthly</span>
        )}
      </header>
      <div aria-label="Chart legend" className="activity-legend">
        {legend.map((item) => (
          <span key={item.label}>
            <i className={item.className} />
            {item.label}
          </span>
        ))}
      </div>
      <EmailActivityChart data={chartData} />
    </PaperCard>
  );
}
