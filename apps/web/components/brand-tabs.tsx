"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { FILTER_PARAMS } from "@/lib/format";

/** Section tabs that keep the current filters when switching pages. */
export function BrandTabs({ base, tabs }: { base: string; tabs: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of FILTER_PARAMS) {
    const v = params.get(k);
    if (v) keep.set(k, v);
  }
  const qs = keep.toString() ? `?${keep}` : "";

  return (
    <nav aria-label="Brand sections" className="flex gap-1 overflow-x-auto border-b text-sm">
      {tabs.map((t) => {
        const href = `${base}${t.href}`;
        const active = t.href === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={t.href}
            href={`${href}${qs}`}
            aria-current={active ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 ${active ? "border-neutral-900 font-medium" : "border-transparent text-neutral-600 hover:text-neutral-900"}`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
