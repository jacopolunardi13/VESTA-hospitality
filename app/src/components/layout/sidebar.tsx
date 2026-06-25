"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  label: string;
  href?: string;
};

const mainNav: NavItem[] = [
  { label: "Inbox",         href: "/inbox" },
  { label: "Conversazioni", href: "/conversations" },
  { label: "Calendario",    href: "/calendar" },
  { label: "Camere",        href: "/rooms" },
  { label: "Knowledge base", href: "/knowledge" },
  { label: "Router email", href: "/email-router" },
  { label: "Document Center", href: "/documents" },
  { label: "Template" },
  { label: "Follow-up" },
];

const settingsNav: NavItem[] = [{ label: "Impostazioni", href: "/settings/property" }];

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const base = "flex items-center justify-between rounded-md px-3 py-2 text-sm";
  if (!item.href) {
    return (
      <span
        className={`${base} cursor-not-allowed text-slate-400`}
        title="In arrivo in un prossimo incremento"
      >
        {item.label}
        <span className="text-[10px] uppercase tracking-wide text-slate-300">presto</span>
      </span>
    );
  }
  return (
    <Link
      href={item.href}
      className={`${base} font-medium transition-colors ${
        active ? "bg-brand-anthracite text-white" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {item.label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-52 shrink-0 flex-col border-r border-slate-200 bg-white p-3 md:flex">
      <nav className="flex flex-col gap-1">
        {mainNav.map((item) => (
          <NavLink
            key={item.label}
            item={item}
            active={!!item.href && pathname.startsWith(item.href)}
          />
        ))}
      </nav>
      <div className="my-3 border-t border-slate-200" />
      <nav className="flex flex-col gap-1">
        {settingsNav.map((item) => (
          <NavLink
            key={item.label}
            item={item}
            active={!!item.href && pathname.startsWith(item.href)}
          />
        ))}
      </nav>
    </aside>
  );
}
