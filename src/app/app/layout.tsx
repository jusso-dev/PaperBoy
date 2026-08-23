import Link from "next/link";

const navItems = [
  { href: "/app", label: "Overview" },
  { href: "/app/send", label: "Send" },
  { href: "/app/logs", label: "Logs" },
  { href: "/app/domains", label: "Domains" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <aside>
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
      </aside>
      <main>{children}</main>
    </div>
  );
}
