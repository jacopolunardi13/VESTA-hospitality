"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { awaitingStaffCount, inboxActionCount } from "@/lib/mock/data";

const items = [
  { label: "Inbox", href: "/inbox", icon: "📥", badge: inboxActionCount },
  { label: "Conversazioni", href: "/conversations", icon: "💬", badge: awaitingStaffCount },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white md:hidden">
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
              active ? "text-slate-900" : "text-slate-400"
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {item.icon}
            </span>
            {item.label}
            {item.badge > 0 && (
              <span className="absolute top-1 right-[calc(50%-1.75rem)] inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {item.badge}
              </span>
            )}
            {active && <span className="absolute inset-x-8 top-0 h-0.5 rounded bg-slate-900" />}
          </Link>
        );
      })}
    </nav>
  );
}
