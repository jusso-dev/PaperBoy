import Link from "next/link";
import { signOutAction } from "./actions";
import { requireOrganization } from "@/lib/session";

const navItems = [
  { href: "/app", label: "Overview" },
  { href: "/app/send", label: "Send" },
  { href: "/app/templates", label: "Templates" },
  { href: "/app/broadcasts", label: "Broadcasts" },
  { href: "/app/logs", label: "Logs" },
  { href: "/app/domains", label: "Domains" },
  { href: "/app/api-keys", label: "API keys" },
  { href: "/app/organization", label: "Organization" },
  { href: "/app/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { organization, session } = await requireOrganization();

  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/" className="masthead">PaperBoy</Link>
        <nav>
          <ul>
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href}>{item.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="session-controls">
          <p className="session-organization">{organization.name}</p>
          <p className="session-role">{organization.role}</p>
          <p className="session-name">{session.user.name}</p>
          <p className="session-email">{session.user.email}</p>
          <form action={signOutAction}>
            <button className="btn session-sign-out" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="console-main">{children}</main>
    </div>
  );
}
