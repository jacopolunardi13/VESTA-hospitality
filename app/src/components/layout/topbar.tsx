"use client";

import { useState } from "react";
import { properties } from "@/lib/mock/data";

export default function Topbar() {
  const [propertyId, setPropertyId] = useState(properties[0].id);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:gap-4 sm:px-4">
      <span className="shrink-0 text-sm font-bold tracking-tight whitespace-nowrap text-slate-900">
        AI Concierge<span className="hidden font-normal text-slate-400 lg:inline"> &amp; Direct Quote</span>
      </span>
      <label className="flex min-w-0 items-center gap-2 text-sm text-slate-600">
        <span className="hidden text-xs text-slate-400 md:inline">Struttura</span>
        <select
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value)}
          className="min-w-0 max-w-[180px] truncate rounded-md border border-slate-300 bg-white px-2 py-1 text-sm sm:max-w-none"
        >
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.city})
            </option>
          ))}
        </select>
      </label>
      <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
        <span
          className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-amber-800"
          title="Interfaccia demo con dati mock"
        >
          DEMO<span className="hidden sm:inline"> · dati mock</span>
        </span>
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-xs font-semibold text-white"
          title="Jacopo Lunardi (owner)"
        >
          JL
        </div>
      </div>
    </header>
  );
}
