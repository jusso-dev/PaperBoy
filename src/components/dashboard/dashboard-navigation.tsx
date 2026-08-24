"use client";

import {
  BookOpenText,
  Clock3,
  Globe2,
  House,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  Mail,
  Radio,
  Settings,
  ShieldX,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const icons = {
  activity: Clock3,
  audiences: ListChecks,
  broadcasts: Radio,
  docs: BookOpenText,
  domains: Globe2,
  emails: Mail,
  keys: KeyRound,
  overview: House,
  settings: Settings,
  suppressions: ShieldX,
  templates: LayoutTemplate,
};

export type DashboardNavItem = {
  href: string;
  icon: keyof typeof icons;
  label: string;
};

function isCurrentPath(pathname: string, href: string): boolean {
  return href === "/app"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardNavigation({ items }: { items: DashboardNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard navigation" className="dashboard-nav">
      <ul>
        {items.map((item) => {
          const Icon = icons[item.icon];
          const current = isCurrentPath(pathname, item.href);

          return (
            <li key={item.href}>
              <Link
                aria-current={current ? "page" : undefined}
                className={cn("dashboard-nav-link", current && "is-current")}
                href={item.href}
              >
                <Icon aria-hidden="true" strokeWidth={1.6} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
