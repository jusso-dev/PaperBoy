"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DashboardActivityPoint } from "@/lib/dashboard";

function ActivityTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ color?: string; name?: string; value?: number }>;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="activity-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <span key={entry.name}>
          <i style={{ backgroundColor: entry.color }} />
          {entry.name}: {(entry.value ?? 0).toLocaleString("en-AU")}
        </span>
      ))}
    </div>
  );
}

export function EmailActivityChart({ data }: { data: DashboardActivityPoint[] }) {
  return (
    <div className="activity-chart" role="img" aria-label="Daily delivered, opened, and clicked email events">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart accessibilityLayer barCategoryGap="24%" data={data} margin={{ bottom: 0, left: -12, right: 4, top: 8 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="2 4" vertical={false} />
          <XAxis axisLine={false} dataKey="date" interval="preserveStartEnd" tick={{ fill: "var(--ink-muted)", fontSize: 11 }} tickLine={false} />
          <YAxis allowDecimals={false} axisLine={false} tick={{ fill: "var(--ink-muted)", fontSize: 11 }} tickFormatter={(value) => value >= 1000 ? `${value / 1000}K` : String(value)} tickLine={false} width={42} />
          <Tooltip content={<ActivityTooltip />} cursor={{ fill: "var(--paper-dark)", opacity: 0.35 }} />
          <Bar dataKey="clicked" fill="var(--line)" isAnimationActive={false} name="Clicked" stackId="mail" />
          <Bar dataKey="opened" fill="var(--postal-blue-light)" isAnimationActive={false} name="Opened" stackId="mail" />
          <Bar dataKey="delivered" fill="var(--postal-blue)" isAnimationActive={false} name="Delivered" stackId="mail" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
