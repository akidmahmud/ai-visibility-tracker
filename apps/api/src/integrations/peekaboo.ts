// Peekaboo REST API v1 (help-center/rest-api, Oct 2026): https://www.aipeekaboo.com/api/v1, X-API-Key: pk_...,
// envelope { success, data, metadata, pagination? }. Used once to import a client's configuration.

const BASE = "https://www.aipeekaboo.com/api/v1";

type Envelope<T> = { success: boolean; data: T; pagination?: { offset: number; limit: number; total: number; hasMore: boolean }; error?: { message?: string } };

export type PkBrand = { id: string; name: string; url: string; analysisFrequency?: string };
export type PkPrompt = { text: string; intent: string | null; category: string | null };
export type PkCompetitor = { name: string; url: string | null };

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Fields are read defensively: the docs show endpoints, not every field name, and imports must not crash on extras. */
export const toPrompt = (p: Record<string, unknown>): PkPrompt | null => {
  const text = str(p.promptText) ?? str(p.text) ?? str(p.prompt);
  if (!text) return null;
  const cat = p.category as unknown;
  return {
    text,
    intent: str(p.searchIntent) ?? str(p.intent),
    category: str(cat) ?? str((cat as { name?: string } | null)?.name) ?? str(p.categoryName),
  };
};
export const toCompetitor = (c: Record<string, unknown>): PkCompetitor | null => {
  const name = str(c.name);
  return name ? { name, url: str(c.url) ?? str(c.domain) } : null;
};
export const toBrand = (b: Record<string, unknown>): PkBrand | null => {
  const id = str(b.id);
  const name = str(b.name);
  const url = str(b.url) ?? str(b.website);
  return id && name && url ? { id, name, url, analysisFrequency: str(b.analysisFrequency) ?? undefined } : null;
};

/** Daily brand scores from /visibility/timeseries, tolerant of the series shape; nulls are unmeasured days. */
export function toBaseline(data: unknown, brandName: string): { day: string; score: number }[] {
  const d = data as { series?: unknown[]; brand?: { series?: unknown[] }; timeSeries?: unknown[] };
  const rows = (d?.brand?.series ?? d?.series ?? d?.timeSeries ?? []) as Record<string, unknown>[];
  return rows.flatMap((r) => {
    const day = str(r.date) ?? str(r.day);
    const raw = r.score ?? r.visibilityScore ?? r[brandName];
    return day && typeof raw === "number" ? [{ day: day.slice(0, 10), score: raw }] : [];
  });
}

export class PeekabooClient {
  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string): Promise<Envelope<T>> {
    const res = await fetch(`${BASE}${path}`, { headers: { "X-API-Key": this.apiKey }, signal: AbortSignal.timeout(30_000) });
    const json = (await res.json().catch(() => null)) as Envelope<T> | null;
    if (!res.ok || !json?.success) throw new Error(`Peekaboo ${res.status}: ${json?.error?.message ?? "request failed"}`);
    return json;
  }

  /** Every page of a list endpoint. */
  private async all(path: string): Promise<Record<string, unknown>[]> {
    const out: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 10_000; ) {
      const sep = path.includes("?") ? "&" : "?";
      const r = await this.get<unknown>(`${path}${sep}offset=${offset}&limit=100`);
      const items = (Array.isArray(r.data) ? r.data : ((r.data as Record<string, unknown[]>)?.items ?? Object.values(r.data as object).find(Array.isArray) ?? [])) as Record<string, unknown>[];
      out.push(...items);
      if (!r.pagination?.hasMore || !items.length) break;
      offset += items.length;
    }
    return out;
  }

  brands = async () => (await this.all("/brands")).map(toBrand).filter((b): b is PkBrand => !!b);
  prompts = async (brandId: string) => (await this.all(`/brands/${brandId}/prompts`)).map(toPrompt).filter((p): p is PkPrompt => !!p);
  competitors = async (brandId: string) => (await this.all(`/brands/${brandId}/competitors`)).map(toCompetitor).filter((c): c is PkCompetitor => !!c);
  baseline = async (brandId: string, brandName: string) =>
    toBaseline((await this.get<unknown>(`/brands/${brandId}/visibility/timeseries?time_range=90d&include_competitors=false`)).data, brandName);
}
