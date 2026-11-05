"use client";

import { Calendar, Check, ChevronDown, Filter, Layers, Tag } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { SiteIcon } from "@/components/site-icon";
import { ENGINES, INTENTS } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Native <details> popover that closes on outside click and Escape. */
function Menu({ label, icon, active, children, align = "left" }: { label: string; icon?: React.ReactNode; active?: boolean; children: React.ReactNode; align?: "left" | "right" }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      if (ref.current?.open && !(e instanceof KeyboardEvent ? e.key !== "Escape" : ref.current.contains(e.target as Node))) ref.current.open = false;
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary
        className={cn(
          "flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg border bg-white px-3 text-sm hover:bg-neutral-50 [&::-webkit-details-marker]:hidden",
          active && "border-brand/40 bg-brand-soft text-brand",
        )}
      >
        {icon}
        <span className="max-w-48 truncate">{label}</span>
        <ChevronDown className="size-3.5 opacity-60" />
      </summary>
      <div className={cn("absolute z-30 mt-1 max-h-80 min-w-56 overflow-auto rounded-lg border bg-white p-1 shadow-lg", align === "right" ? "right-0" : "left-0")}>{children}</div>
    </details>
  );
}

function Option({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} onClick={onClick} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-neutral-100">
      <span className={cn("grid size-4 place-items-center rounded border", on && "border-brand bg-brand text-white")}>{on && <Check className="size-3" />}</span>
      {children}
    </button>
  );
}

function MultiFilter({ param, allLabel, icon, options }: { param: string; allLabel: string; icon: React.ReactNode; options: [string, string][] }) {
  const { list, set } = useFilters();
  const selected = list(param);
  const label = !selected.length ? allLabel : selected.length === 1 ? (options.find(([v]) => v === selected[0])?.[1] ?? allLabel) : `${selected.length} selected`;
  return (
    <Menu label={label} icon={icon} active={selected.length > 0} align="right">
      <Option on={!selected.length} onClick={() => set(param, [])}>{allLabel}</Option>
      <div className="my-1 border-t" />
      {options.map(([v, text]) => (
        <Option key={v} on={selected.includes(v)} onClick={() => set(param, selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])}>
          {text}
        </Option>
      ))}
    </Menu>
  );
}

function useFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return {
    params,
    list: (k: string) => (params.get(k) ?? "").split(",").filter(Boolean),
    set: (key: string, values: string[] | string) => {
      const p = new URLSearchParams(params);
      const v = Array.isArray(values) ? values.join(",") : values;
      if (v) p.set(key, v);
      else p.delete(key);
      p.delete("page");
      router.replace(`${pathname}?${p.toString()}`, { scroll: false });
    },
  };
}

const RANGES: [string, string][] = [
  ["7", "Last 7 days"],
  ["30", "Last 30 days"],
  ["90", "Last 90 days"],
];
// pages whose numbers don't depend on the filters: hide them so they don't imply they do
const NO_FILTERS = /\/(ask|actions|briefs|share|settings|crawlers|traffic|market-traffic|search-console|report)$/;

export function TopBar({ brand, brands, topics, models }: { brand: { id: string; name: string; domain: string }; brands: { id: string; name: string; domain: string }[]; topics: { id: string; name: string }[]; models: string[] }) {
  const pathname = usePathname();
  const { params, set } = useFilters();
  const days = params.get("days") ?? "30";
  const sub = pathname.replace(`/brands/${brand.id}`, "");
  return (
    <>
      <Menu label={brand.name} icon={<SiteIcon domain={brand.domain} name={brand.name} size={18} />}>
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Switch brand</p>
        {brands.map((b) => (
          <Link key={b.id} href={`/brands/${b.id}${sub.startsWith("/chats/") || sub.startsWith("/prompts/") ? "" : sub}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-100">
            <SiteIcon domain={b.domain} name={b.name} size={16} />
            <span className="flex-1 truncate">{b.name}</span>
            {b.id === brand.id && <Check className="size-3.5 text-brand" />}
          </Link>
        ))}
        <div className="my-1 border-t" />
        <Link href="/" className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-neutral-100">All brands / add a brand</Link>
      </Menu>
      {!NO_FILTERS.test(pathname) && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <MultiFilter param="models" allLabel="All models" icon={<Layers className="size-4 opacity-70" />} options={models.map((m) => [m, ENGINES[m] ?? m])} />
          {topics.length > 0 && <MultiFilter param="topics" allLabel="All topics" icon={<Tag className="size-4 opacity-70" />} options={topics.map((t) => [t.id, t.name])} />}
          <MultiFilter param="intents" allLabel="All intents" icon={<Filter className="size-4 opacity-70" />} options={Object.entries(INTENTS)} />
          <Menu label={RANGES.find(([d]) => d === days)?.[1] ?? "Last 30 days"} icon={<Calendar className="size-4 opacity-70" />} align="right">
            {RANGES.map(([d, text]) => (
              <Option key={d} on={days === d} onClick={() => set("days", d)}>{text}</Option>
            ))}
          </Menu>
        </div>
      )}
    </>
  );
}
