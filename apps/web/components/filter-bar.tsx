"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ENGINES, INTENTS, TRACKED_ENGINES } from "@/lib/format";
import { cn } from "@/lib/utils";

type Topic = { id: string; name: string };

function Chips({ label, options, selected, onChange }: { label: string; options: [string, string][]; selected: string[]; onChange: (next: string[]) => void }) {
  const chip = (on: boolean) => cn("rounded-full border px-3 py-1", on ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent");
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-1">
      <button aria-pressed={!selected.length} onClick={() => onChange([])} className={chip(!selected.length)}>
        All {label.toLowerCase()}
      </button>
      {options.map(([value, text]) => (
        <button
          key={value}
          aria-pressed={selected.includes(value)}
          onClick={() => onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])}
          className={chip(selected.includes(value))}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** Date range, engine, intent and topic filters, one block above the charts; state lives in the URL. */
export function FilterBar({ topics = [] }: { topics?: Topic[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const days = params.get("days") ?? "30";
  // these pages don't depend on the filters; hiding the bar avoids implying they do
  if (/\/(actions|briefs|share|settings|crawlers)$/.test(pathname)) return null;
  const list = (k: string) => (params.get(k) ?? "").split(",").filter(Boolean);

  const set = (key: string, values: string[] | string) => {
    const p = new URLSearchParams(params);
    const v = Array.isArray(values) ? values.join(",") : values;
    if (v) p.set(key, v);
    else p.delete(key);
    p.delete("page");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Date range" className="flex overflow-hidden rounded-md border bg-card">
          {["7", "30", "90"].map((d) => (
            <button key={d} aria-pressed={days === d} onClick={() => set("days", d)} className={cn("px-3 py-1.5", days === d ? "bg-primary text-primary-foreground" : "hover:bg-accent")}>
              {d} days
            </button>
          ))}
        </div>
        <Chips label="Engines" options={TRACKED_ENGINES.map((m) => [m, ENGINES[m]!])} selected={list("models")} onChange={(v) => set("models", v)} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Chips label="Intents" options={Object.entries(INTENTS)} selected={list("intents")} onChange={(v) => set("intents", v)} />
        {topics.length > 0 && <Chips label="Topics" options={topics.map((t) => [t.id, t.name])} selected={list("topics")} onChange={(v) => set("topics", v)} />}
      </div>
    </div>
  );
}
