"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer, Tooltip } from "recharts";
import { PaperCard } from "@/components/paper/paper-card";
import type { DashboardMetric } from "@/lib/dashboard";

function MetricTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
}) {
  if (!active || payload?.[0]?.value === undefined) return null;
  return <span className="sparkline-tooltip">{payload[0].value.toLocaleString("en-AU")}</span>;
}

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  const chartData = metric.trend.map((value, index) => ({ index, value }));
  const delta = metric.delta;
  const DeltaIcon = delta === null || delta === 0
    ? Minus
    : delta > 0
      ? ArrowUpRight
      : ArrowDownRight;

  return (
    <PaperCard as="article" className="metric-card">
      <p className="metric-label">{metric.label}</p>
      <div className="metric-value-row">
        <strong title={metric.note}>{metric.value === null ? "—" : metric.value.toLocaleString("en-AU")}</strong>
        <span className="metric-delta" title={metric.note}>
          <DeltaIcon aria-hidden="true" strokeWidth={1.8} />
          {metric.value === null
            ? "Not tracked"
            : delta === null
              ? "New"
              : `${delta > 0 ? "+" : ""}${delta}%`}
        </span>
      </div>
      <div className="metric-sparkline" role="img" aria-label={`${metric.label} daily trend`}>
        <ResponsiveContainer height="100%" width="100%">
          <AreaChart accessibilityLayer data={chartData} margin={{ bottom: 1, left: 1, right: 1, top: 4 }}>
            <Tooltip content={<MetricTooltip />} cursor={false} />
            <Area
              dataKey="value"
              dot={false}
              fill="var(--postal-blue-light)"
              fillOpacity={0.32}
              isAnimationActive={false}
              stroke="var(--postal-blue)"
              strokeWidth={2}
              type="linear"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </PaperCard>
  );
}
