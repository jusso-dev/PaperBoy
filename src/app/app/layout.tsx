import { signOutAction } from "./actions";
import { DashboardSidebar } from "@/components/dashboard/dashboard-sidebar";
import { MobileDashboardNavigation } from "@/components/dashboard/mobile-dashboard-navigation";
import { AirmailEdge } from "@/components/paper/airmail-edge";
import { requireOrganization } from "@/lib/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization, session } = await requireOrganization();
  const sidebarProps = {
    email: session.user.email,
    image: session.user.image,
    name: session.user.name,
    organizationName: organization.name,
    signOutAction,
  };

  return (
    <div className="dashboard-shell">
      <a className="skip-link" href="#dashboard-content">Skip to content</a>
      <AirmailEdge />
      <aside className="dashboard-sidebar">
        <DashboardSidebar {...sidebarProps} />
      </aside>
      <div className="dashboard-stage">
        <MobileDashboardNavigation>
          <DashboardSidebar {...sidebarProps} />
        </MobileDashboardNavigation>
        <main className="dashboard-main" id="dashboard-content">{children}</main>
      </div>
    </div>
  );
}
