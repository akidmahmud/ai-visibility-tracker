"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";

type Result =
  | { brands: number; report: { brand: string; created: boolean; prompts: number; competitors: number; baselineDays: number; error?: string }[] }
  | { error: string }
  | null;

export function PeekabooImportForm({ action }: { action: (prev: Result, form: FormData) => Promise<Result> }) {
  const [result, run, pending] = useActionState(action, null);
  return (
    <Card className="space-y-3 p-4 text-sm">
      <form action={run} className="flex flex-wrap gap-2">
        <label htmlFor="pk-key" className="sr-only">Peekaboo API key</label>
        <Input id="pk-key" name="apiKey" required autoComplete="off" placeholder="pk_…" className="max-w-md font-mono" />
        <Button disabled={pending}>{pending ? "Importing… (can take a few minutes)" : "Import"}</Button>
      </form>
      {result && "error" in result && <p role="alert" className="text-destructive">{result.error}</p>}
      {result && "report" in result && (
        <div className="space-y-1">
          <p className="font-medium">Imported {result.brands} brands.</p>
          <ul className="max-h-64 space-y-0.5 overflow-auto text-muted-foreground">
            {result.report.map((r) => (
              <li key={r.brand}>
                {r.brand}: {r.error ? <span className="text-destructive">{r.error}</span> : `${r.created ? "new" : "updated"}, ${r.prompts} prompts added, ${r.competitors} competitors, ${r.baselineDays} days of history`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
