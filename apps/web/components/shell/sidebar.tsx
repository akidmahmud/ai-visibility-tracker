"use client";

import {
  BarChart3,
  Bot,
  FileText,
  Globe,
  KeyRound,
  LayoutGrid,
  ListChecks,
  MessageSquare,
  MessagesSquare,
  Network,
  Plug,
  Radar,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SignOutButton } from "@/app/sign-out-button";
import { FILTER_PARAMS } from "@/lib/format";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; badge?: string | number; beta?: boolean; exact?: boolean; keepFilters?: boolean };

export type SidebarProps = {
  appName: string;
  brandId: string | null;
  todoCount: number;
  isAdmin: boolean;
  email: string;
  name: string;
};

function NavLink({ item }: { item: Item }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const path = item.href.split("?")[0]!;
  const active = item.exact ? pathname === path : pathname === path || pathname.startsWith(`${path}/`);
  // carry the dashboard filters between analytics pages
  const carry = new URLSearchParams();
  if (item.keepFilters) for (const k of FILTER_PARAMS) if (params.get(k)) carry.set(k, params.get(k)!);
  const href = carry.size ? `${item.href}?${carry}` : item.href;
  const Icon = item.icon;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-md px-3 py-[5px] text-[13.5px] text-slate-400 hover:bg-white/5 hover:text-slate-100",
        active && "bg-white/[0.08] font-medium text-white hover:bg-white/[0.08]",
      )}
    >
      {active && <span aria-hidden className="absolute -left-3 top-1 bottom-1 w-[3px] rounded-r bg-signal" />}
      <Icon className={cn("size-4 shrink-0", active && "text-signal")} />
      <span className="flex-1 truncate">{item.label}</span>
      {item.beta && <span className="rounded border border-signal/40 px-1.5 py-px font-mono text-[9.5px] font-semibold uppercase text-signal">Beta</span>}
      {item.badge ? <span className="rounded-full bg-signal px-1.5 font-mono text-[11px] font-bold text-ink">{item.badge}</span> : null}
    </Link>
  );
}

function Section({ title, items }: { title?: string; items: Item[] }) {
  return (
    <div className="space-y-0.5">
      {title && <p className="px-3 pb-1 pt-3 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">{title}</p>}
      {items.map((i) => (
        <NavLink key={i.href} item={i} />
      ))}
    </div>
  );
}

/** Left navigation. Brand pages need a brand; without one only workspace links show. */
export function Sidebar({ appName, brandId, todoCount, isAdmin, email, name }: SidebarProps) {
  const b = brandId ? `/brands/${brandId}` : null;
  return (
    <aside className="no-print sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-ink text-slate-200">
      <Link href="/" className="flex h-14 items-center gap-2.5 border-b border-white/10 px-5 font-bold tracking-tight text-white">
        <span aria-hidden className="grid size-7 place-items-center rounded-md bg-signal text-ink">
          <Radar className="size-4" />
        </span>
        <span className="truncate">{appName}</span>
      </Link>
      <nav aria-label="Product" className="flex-1 overflow-y-auto px-3 py-2">
        {b && (
          <>
            <Section items={[{ href: `${b}/ask`, label: "Ask AI", icon: Sparkles, beta: true }]} />
            <Section
              title="Visibility"
              items={[
                { href: b, label: "Overview", icon: LayoutGrid, exact: true, keepFilters: true },
                { href: `${b}/prompts`, label: "Prompts", icon: MessageSquare, keepFilters: true },
                { href: `${b}/competitors`, label: "Competitors", icon: Users, keepFilters: true },
                { href: `${b}/sources`, label: "Sources", icon: Network, keepFilters: true },
                { href: `${b}/chats`, label: "Chats", icon: MessagesSquare, keepFilters: true },
              ]}
            />
            <Section
              title="Traffic"
              items={[
                { href: `${b}/market-traffic`, label: "Market Traffic", icon: Globe },
                { href: `${b}/search-console`, label: "Search Console", icon: Search },
                { href: `${b}/traffic`, label: "Google Analytics", icon: BarChart3 },
                { href: `${b}/crawlers`, label: "AI Crawlers", icon: Bot },
              ]}
            />
            <Section
              title="Improve"
              items={[
                { href: `${b}/actions`, label: "To-dos", icon: ListChecks, badge: todoCount || undefined },
                { href: `${b}/briefs`, label: "Content Briefs", icon: FileText },
              ]}
            />
          </>
        )}
        <Section
          title="Workspace"
          items={[
            ...(b ? [{ href: `${b}/share`, label: "Share links", icon: Share2 }] : []),
            { href: "/settings/integrations", label: "Integrations", icon: Plug },
            ...(b ? [{ href: `${b}/settings`, label: "Brand settings", icon: SlidersHorizontal }] : []),
            { href: "/settings", label: "Workspace settings", icon: Settings, exact: true },
          ]}
        />
        {isAdmin && (
          <Section
            title="Super admin"
            items={[
              { href: "/admin", label: "Admin overview", icon: ShieldCheck, exact: true },
              { href: "/admin/providers", label: "Providers", icon: KeyRound },
            ]}
          />
        )}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-2.5 rounded-md bg-white/5 px-2.5 py-2">
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-signal text-xs font-bold uppercase text-ink">
            {(name || email).slice(0, 1)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-white">{name || email.split("@")[0]}</p>
            <p className="truncate text-[11px] text-slate-400">{email}</p>
          </div>
          <SignOutButton />
        </div>
      </div>
    </aside>
  );
}
