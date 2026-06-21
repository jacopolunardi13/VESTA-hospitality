"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const tabs = [
  { label: "Inbox",      href: "/inbox",         icon: "📥" },
  { label: "Chat",       href: "/conversations", icon: "💬" },
  { label: "Calendario", href: "/calendar",      icon: "📅" },
  { label: "Camere",     href: "/rooms",         icon: "🛏" },
];

const moreLinks = [
  { label: "Knowledge base", href: "/knowledge",         icon: "📚" },
  { label: "Impostazioni",   href: "/settings/property", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = moreLinks.some((l) => pathname.startsWith(l.href));

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {tabs.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              onClick={() => setMoreOpen(false)}
              className={`relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
                active ? "text-slate-900" : "text-slate-400"
              }`}
            >
              <span className="text-lg leading-none" aria-hidden>{t.icon}</span>
              <span className="max-w-full truncate">{t.label}</span>
              {active && <span className="absolute inset-x-5 top-0 h-0.5 rounded bg-slate-900" />}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
            moreActive || moreOpen ? "text-slate-900" : "text-slate-400"
          }`}
          aria-label="Altro"
        >
          <span className="text-lg leading-none" aria-hidden>⋯</span>
          Altro
        </button>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 mt-1 h-1 w-10 rounded-full bg-slate-300" />
            {moreLinks.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMoreOpen(false)}
                className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <span className="text-base" aria-hidden>{l.icon}</span>
                {l.label}
              </Link>
            ))}
            <span className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm text-slate-400">
              <span className="text-base" aria-hidden>🗓</span>
              Template · Follow-up
              <span className="ml-auto text-[10px] uppercase tracking-wide">presto</span>
            </span>
          </div>
        </div>
      )}
    </>
  );
}
