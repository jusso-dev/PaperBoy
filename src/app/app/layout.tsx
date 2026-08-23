import Link from "next/link";
import { signOutAction } from "./actions";
import { requireSession } from "@/lib/session";

const navItems = [
  { href: "/app", label: "Overview" },
  { href: "/app/send", label: "Send" },
  { href: "/app/logs", label: "Logs" },
  { href: "/app/domains", label: "Domains" },
  { href: "/app/settings", label: "Settings" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession();

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
