import { MetricCard } from "@/components/dashboard/metric-card";
import type { DashboardMetric } from "@/lib/dashboard";

export function MetricsGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <section aria-label="Email delivery summary" className="metrics-grid">
      {metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
    </section>
  );
}
