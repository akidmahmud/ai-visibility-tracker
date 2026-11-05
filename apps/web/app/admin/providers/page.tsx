import { Button } from "@/components/ui/button";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { ProviderTest, type TestResult } from "./provider-test";

type Route = { model: string; primary: string; fallback: string | null; enabled: boolean; updatedBy: string | null; updatedAt: string | null };
type Health = {
  provider: string;
  model: string;
  answers: number;
  successRate: number | null;
  noAiResultRate: number | null;
  avgLatencyMs: number | null;
  lastError: string | null;
  lastErrorAt: string | null;
};
type Cost = { provider: string; model: string; calls: number; creditsPer1k: number | null; usdPer1k: number | null };
type Change = { id: string; actor: string; target: string; before: Route; after: Route; createdAt: string };
type Overview = { providers: { name: string; models: string[]; configured: boolean }[]; routes: Route[]; health: Health[]; costPer1k: Cost[]; changes: Change[] };

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);
const fmt = (d: string) => new Date(d).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
const ENGINE: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  perplexity: "Perplexity",
  google_aio: "Google AI Overview",
  google_ai_mode: "Google AI Mode",
  copilot: "Copilot",
  claude: "Claude",
};

async function saveRoute(form: FormData) {
  "use server";
  const fallback = String(form.get("fallback"));
  await api(`/admin/providers/${form.get("model")}`, {
    method: "PUT",
    body: JSON.stringify({ primary: form.get("primary"), fallback: fallback || null, enabled: form.get("enabled") === "on" }),
  });
  revalidatePath("/admin/providers");
}

async function runTest(_: TestResult | null, form: FormData): Promise<TestResult> {
  "use server";
  return api<TestResult>("/admin/providers/test", {
    method: "POST",
    body: JSON.stringify({ model: form.get("model"), provider: form.get("provider"), prompt: form.get("prompt") }),
  }).catch((e: Error) => ({ ok: false, error: e.message }));
}

export default async function ProvidersAdmin() {
  let data: Overview;
  try {
    data = await api<Overview>("/admin/providers");
  } catch (e) {
    if ((e as Error).message.startsWith("API 403")) return <p className="text-neutral-600">This page is for super-admins only.</p>;
    throw e;
  }
  const configured = new Set(data.providers.filter((p) => p.configured).map((p) => p.name));
  const forModel = (m: string) => data.providers.filter((p) => p.models.includes(m)).map((p) => p.name);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Answer providers</h1>
        <p className="text-sm text-neutral-600">
          Which service captures each engine. Changes apply to new captures within 30 seconds. Switching providers shifts the numbers, so every change is logged below.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Routing</h2>
        <div className="divide-y rounded-lg border bg-white">
          {data.routes.filter((r) => forModel(r.model).length).map((r) => (
            <form key={r.model} action={saveRoute} className="flex flex-wrap items-end gap-3 p-4 text-sm">
              <input type="hidden" name="model" value={r.model} />
              <p className="w-44 font-medium">{ENGINE[r.model] ?? r.model}</p>
              <label className="space-y-1">
                <span className="block text-neutral-500">Primary</span>
                <select name="primary" defaultValue={r.primary} className="rounded border px-2 py-1.5">
                  {forModel(r.model).map((p) => (
                    <option key={p} value={p}>{p}{configured.has(p) ? "" : " (no credentials)"}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1">
                <span className="block text-neutral-500">Fallback</span>
                <select name="fallback" defaultValue={r.fallback ?? ""} className="rounded border px-2 py-1.5">
                  <option value="">None</option>
                  {forModel(r.model).map((p) => (
                    <option key={p} value={p}>{p}{configured.has(p) ? "" : " (no credentials)"}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 pb-1.5">
                <input type="checkbox" name="enabled" defaultChecked={r.enabled} /> Capture this engine
              </label>
              <Button size="sm">Save</Button>
              {r.updatedBy && <p className="w-full text-xs text-neutral-500">Last changed by {r.updatedBy} on {fmt(r.updatedAt!)}</p>}
            </form>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Health, last 7 days</h2>
        {data.health.length === 0 ? (
          <p className="text-sm text-neutral-500">No captures in the last 7 days.</p>
        ) : (
          <table className="w-full rounded-lg border bg-white text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="p-3 font-medium">Provider</th>
                <th className="p-3 font-medium">Engine</th>
                <th className="p-3 text-right font-medium">Answers</th>
                <th className="p-3 text-right font-medium">Succeeded</th>
                <th className="p-3 text-right font-medium">No AI answer</th>
                <th className="p-3 text-right font-medium">Avg time</th>
                <th className="p-3 font-medium">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.health.map((h) => (
                <tr key={`${h.provider}-${h.model}`}>
                  <td className="p-3">{h.provider}</td>
                  <td className="p-3">{ENGINE[h.model] ?? h.model}</td>
                  <td className="p-3 text-right tabular-nums">{h.answers}</td>
                  <td className="p-3 text-right tabular-nums">{pct(h.successRate)}</td>
                  <td className="p-3 text-right tabular-nums">{pct(h.noAiResultRate)}</td>
                  <td className="p-3 text-right tabular-nums">{h.avgLatencyMs ? `${(h.avgLatencyMs / 1000).toFixed(1)} s` : "–"}</td>
                  <td className="max-w-xs p-3 text-xs text-neutral-600">{h.lastError ? `${h.lastError.slice(0, 140)} (${fmt(h.lastErrorAt!)})` : "–"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Cost per 1,000 answers, last 30 days</h2>
        {data.costPer1k.length === 0 ? (
          <p className="text-sm text-neutral-500">No usage recorded yet.</p>
        ) : (
          <table className="w-full rounded-lg border bg-white text-sm">
            <thead className="text-left text-neutral-500">
              <tr>
                <th className="p-3 font-medium">Provider</th>
                <th className="p-3 font-medium">Engine</th>
                <th className="p-3 text-right font-medium">Calls</th>
                <th className="p-3 text-right font-medium">Credits / 1k</th>
                <th className="p-3 text-right font-medium">USD / 1k</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.costPer1k.map((c) => (
                <tr key={`${c.provider}-${c.model}`}>
                  <td className="p-3">{c.provider}</td>
                  <td className="p-3">{ENGINE[c.model] ?? c.model}</td>
                  <td className="p-3 text-right tabular-nums">{c.calls}</td>
                  <td className="p-3 text-right tabular-nums">{c.creditsPer1k?.toFixed(0) ?? "–"}</td>
                  <td className="p-3 text-right tabular-nums">{c.usdPer1k === null ? "–" : `$${c.usdPer1k.toFixed(2)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Test a provider</h2>
        <p className="text-sm text-neutral-600">Runs one real prompt and shows what we would save. This spends credits.</p>
        <ProviderTest action={runTest} providers={data.providers.filter((p) => p.configured)} engines={ENGINE} />
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold">Change log</h2>
        {data.changes.length === 0 ? (
          <p className="text-sm text-neutral-500">No routing changes yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-white text-sm">
            {data.changes.map((c) => (
              <li key={c.id} className="p-3">
                {fmt(c.createdAt)} · {c.actor} · {ENGINE[c.target] ?? c.target}: {c.before.primary}
                {c.before.fallback ? ` → ${c.before.fallback}` : ""} became {c.after.primary}
                {c.after.fallback ? ` → ${c.after.fallback}` : ""}
                {c.after.enabled ? "" : " (disabled)"}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
