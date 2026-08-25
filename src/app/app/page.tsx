import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DateRangeControl } from "@/components/dashboard/date-range-control";
import { EmailActivityPanel } from "@/components/dashboard/email-activity-panel";
import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import { RecentEmails } from "@/components/dashboard/recent-emails";
import { WelcomeNote } from "@/components/dashboard/welcome-note";
import { PostalStamp } from "@/components/brand/postal-stamp";
import {
  dashboardRangeLabel,
  dashboardRangeParam,
  getPaperBoyDashboard,
  parseDashboardRange,
} from "@/lib/dashboard";
import { requireOrganization } from "@/lib/session";

type OverviewProps = {
  searchParams: Promise<{ range?: string }>;
};

export default async function Overview({ searchParams }: OverviewProps) {
  const [{ organization, session }, query] = await Promise.all([
    requireOrganization(),
    searchParams,
  ]);
  const range = parseDashboardRange(query.range);
  const now = new Date();
  const dashboard = await getPaperBoyDashboard({
    actorUserId: session.user.id,
    now,
    orgId: organization.id,
    range,
    timeZone: session.user.timezone,
  });
  const rangeLabel = dashboardRangeLabel({
    now,
    range,
    timeZone: session.user.timezone,
  });

  return (
    <section className="dashboard-overview">
      <DashboardHeader />

      <div className="dashboard-welcome-row">
        <WelcomeNote organizationName={organization.name} />
        <div className="dashboard-postmark">
          <PostalStamp />
          <div className="dashboard-reporting">
            <DateRangeControl label={rangeLabel} range={range} />
            <a
              className="btn btn-compact dashboard-export"
              href={`/app/overview/export?range=${dashboardRangeParam(range)}`}
            >
              Export CSV
            </a>
          </div>
        </div>
      </div>

      <MetricsGrid metrics={dashboard.metrics} />

      <div className="dashboard-analytics-grid">
        <EmailActivityPanel bucket={dashboard.bucket} data={dashboard.activity} />
        <RecentEmails emails={dashboard.recentEmails} now={now} />
      </div>
    </section>
  );
}
