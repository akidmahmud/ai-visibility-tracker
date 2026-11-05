import { headers } from "next/headers";
import { notFound } from "next/navigation";

export type ReportHeader = {
  brand: { name: string; domain: string };
  agency: { name: string; customDomain: string | null; whiteLabel: { agencyName?: string; logoUrl?: string; primaryColor?: string; accentColor?: string } | null };
  visibleTabs: string[];
};

const APP_HOSTS = new Set([new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host, "localhost:3000", "127.0.0.1:3000"]);

/** Public API call (no session). 404/403 → null. */
export async function publicApi<T>(path: string): Promise<T | null> {
  const res = await fetch(`${process.env.API_URL}/public/share/${path}`, { cache: "no-store" });
  if (res.status === 404 || res.status === 403) return null;
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json() as Promise<T>;
}

/**
 * Loads a report's header and enforces the domain rule: on an agency's custom domain only that agency's
 * links render, so one agency's domain can never show another agency's client.
 */
export async function loadReport(token: string): Promise<ReportHeader> {
  const header = await publicApi<ReportHeader>(encodeURIComponent(token));
  if (!header) notFound();
  const host = (await headers()).get("host") ?? "";
  if (!APP_HOSTS.has(host) && host !== header.agency.customDomain) notFound();
  return header;
}

/** CSS variables that re-skin the shadcn tokens with the agency's colors. */
export function brandStyle(h: ReportHeader): React.CSSProperties {
  const wl = h.agency.whiteLabel ?? {};
  return { ...(wl.primaryColor ? { "--primary": wl.primaryColor, "--ring": wl.primaryColor } : {}) } as React.CSSProperties;
}
