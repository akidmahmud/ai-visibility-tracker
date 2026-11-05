"use client";

import { Button } from "@/components/ui/button";
import { useActionState, useState } from "react";

export type TestResult =
  | {
      ok: true;
      status: string;
      text: string | null;
      citations: { url: string; title?: string; position: number }[];
      fanout: { query: string }[];
      cost: { credits?: number; usd?: number };
      latencyMs?: number;
    }
  | { ok: false; error: string };

type Props = {
  action: (prev: TestResult | null, form: FormData) => Promise<TestResult>;
  providers: { name: string; models: string[] }[];
  engines: Record<string, string>;
};

export function ProviderTest({ action, providers, engines }: Props) {
  const [result, run, pending] = useActionState(action, null);
  const [provider, setProvider] = useState(providers[0]?.name ?? "");
  const models = providers.find((p) => p.name === provider)?.models ?? [];

  if (!providers.length) return <p className="text-sm text-neutral-500">No provider has credentials configured.</p>;

  return (
    <div className="space-y-4">
      <form action={run} className="flex flex-wrap items-end gap-3 rounded-lg border bg-white p-4 text-sm">
        <label className="space-y-1">
          <span className="block text-neutral-500">Provider</span>
          <select name="provider" value={provider} onChange={(e) => setProvider(e.target.value)} className="rounded border px-2 py-1.5">
            {providers.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
        </label>
        <label className="space-y-1">
          <span className="block text-neutral-500">Engine</span>
          <select name="model" className="rounded border px-2 py-1.5">
            {models.map((m) => <option key={m} value={m}>{engines[m] ?? m}</option>)}
          </select>
        </label>
        <label className="min-w-64 flex-1 space-y-1">
          <span className="block text-neutral-500">Prompt</span>
          <input name="prompt" required minLength={3} className="w-full rounded border px-2 py-1.5" placeholder="Best AEO agency for Phoenix local business?" />
        </label>
        <Button size="sm" disabled={pending}>
          {pending ? "Running…" : "Run test"}
        </Button>
      </form>

      {result && !result.ok && <p role="alert" className="text-sm text-red-600">{result.error}</p>}
      {result?.ok && (
        <div className="space-y-3 rounded-lg border bg-white p-4 text-sm">
          <p className="text-neutral-600">
            {result.status === "OK" ? "Answer captured" : "No AI answer shown"} · {result.citations.length} sources · {result.fanout.length} search queries
            {result.cost.credits !== undefined && ` · ${result.cost.credits} credits`}
            {result.cost.usd !== undefined && ` · $${result.cost.usd.toFixed(4)}`}
            {result.latencyMs && ` · ${(result.latencyMs / 1000).toFixed(1)} s`}
          </p>
          {result.text && <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-neutral-800">{result.text}</pre>}
          {result.citations.length > 0 && (
            <ol className="list-decimal pl-5 text-neutral-600">
              {result.citations.map((c) => <li key={c.url} className="break-all">{c.title ? `${c.title}: ` : ""}{c.url}</li>)}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
