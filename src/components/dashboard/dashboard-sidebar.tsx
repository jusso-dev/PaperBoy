import { ChevronDown, LogOut } from "lucide-react";
import Link from "next/link";
import { ExpressMailSticker } from "@/components/brand/express-mail-sticker";
import { PaperboyLogo } from "@/components/brand/paperboy-logo";
import {
  DashboardNavigation,
  type DashboardNavItem,
} from "@/components/dashboard/dashboard-navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";

type DashboardSidebarProps = {
  email: string;
  image?: string | null;
  name: string;
  organizationName: string;
  signOutAction: () => Promise<void>;
};

const navItems: DashboardNavItem[] = [
  { href: "/app", icon: "overview", label: "Overview" },
  { href: "/app/logs", icon: "emails", label: "Emails" },
  { href: "/app/templates", icon: "templates", label: "Templates" },
  { href: "/app/audiences", icon: "audiences", label: "Lists" },
  { href: "/app/broadcasts", icon: "broadcasts", label: "Broadcasts" },
  { href: "/app/suppressions", icon: "suppressions", label: "Suppressions" },
  { href: "/app/api-keys", icon: "keys", label: "API Keys" },
  { href: "/app/docs", icon: "docs", label: "API docs" },
  { href: "/app/settings", icon: "settings", label: "Settings" },
];

function initials(value: string): string {
  const letters = value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return letters || "PB";
}

export function DashboardSidebar({
  email,
  image,
  name,
  organizationName,
  signOutAction,
}: DashboardSidebarProps) {
  return (
    <div className="dashboard-sidebar-inner">
      <PaperboyLogo />
      <DashboardNavigation items={navItems} />

      <div className="dashboard-sidebar-lower">
        <ExpressMailSticker />

        <section aria-labelledby="current-plan-title" className="sidebar-plan">
          <p className="sidebar-eyebrow" id="current-plan-title">Current plan</p>
          <strong>Self-hosted</strong>
          <span>Provider limits apply</span>
          <Progress aria-label="PaperBoy service configured" value={100} />
        </section>

        <details className="sidebar-account">
          <summary>
            <Avatar>
              {image ? <AvatarImage alt="" src={image} /> : null}
              <AvatarFallback>{initials(organizationName)}</AvatarFallback>
            </Avatar>
            <span className="sidebar-account-copy">
              <strong>{organizationName}</strong>
              <small>{email}</small>
            </span>
            <ChevronDown aria-hidden="true" strokeWidth={1.6} />
          </summary>
          <div className="sidebar-account-menu">
            <p>Signed in as {name}</p>
            <Link href="/app/organization">Manage organisation</Link>
            <form action={signOutAction}>
              <button type="submit">
                <LogOut aria-hidden="true" strokeWidth={1.6} />
                Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </div>
  );
}
