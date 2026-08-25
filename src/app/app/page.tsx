import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DateRangeControl } from "@/components/dashboard/date-range-control";
import { EmailActivityPanel } from "@/components/dashboard/email-activity-panel";
import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import { RecentEmails } from "@/components/dashboard/recent-emails";
import { WelcomeNote } from "@/components/dashboard/welcome-note";
import { PostalStamp } from "@/components/brand/postal-stamp";
import {
  dashboardRangeLabel,
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
  const rangeDays = parseDashboardRange(query.range);
  const now = new Date();
  const dashboard = await getPaperBoyDashboard({
    actorUserId: session.user.id,
    now,
    orgId: organization.id,
    rangeDays,
    timeZone: session.user.timezone,
  });
  const rangeLabel = dashboardRangeLabel({
    now,
    rangeDays,
    timeZone: session.user.timezone,
  });

  return (
    <section className="dashboard-overview">
      <DashboardHeader />

      <div className="dashboard-welcome-row">
        <WelcomeNote organizationName={organization.name} />
        <div className="dashboard-postmark">
          <PostalStamp />
          <DateRangeControl label={rangeLabel} rangeDays={rangeDays} />
        </div>
      </div>

      <MetricsGrid metrics={dashboard.metrics} />

      <div className="dashboard-analytics-grid">
        <EmailActivityPanel data={dashboard.activity} />
        <RecentEmails emails={dashboard.recentEmails} now={now} />
      </div>
    </section>
  );
}
