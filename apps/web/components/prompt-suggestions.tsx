"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { INTENTS } from "@/lib/format";

const ORIGIN = { site: "from your site", google: "from Google", "ai-search": "from AI searches", "search-console": "from Search Console" };

export type Suggestions = { suggestions: { text: string; intent: string; source: "SUGGESTED" | "FANOUT" | "GSC"; origin: keyof typeof ORIGIN }[]; note: string | null } | { error: string };

type Props = {
  suggest: (prev: Suggestions | null, form: FormData) => Promise<Suggestions>;
  add: (form: FormData) => Promise<void>;
};

/** Prompt ideas from the brand's website and from searches AI ran; tick the ones to track. */
export function PromptSuggestions({ suggest, add }: Props) {
  const [result, run, pending] = useActionState(suggest, null);
  return (
    <Card className="space-y-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">Suggested prompts</p>
          <p className="text-muted-foreground">Ideas from your website and from the searches AI ran while answering. Duplicates of current prompts are left out.</p>
        </div>
        <form action={run} className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" name="google" /> Include Google "People also ask" (about 15 Cloro credits)
          </label>
          <Button variant="outline" size="sm" disabled={pending}>{pending ? "Thinking…" : result ? "Suggest again" : "Suggest prompts"}</Button>
        </form>
      </div>
      {result && "error" in result && <p role="alert" className="text-destructive">{result.error}</p>}
      {result && "suggestions" in result && (
        <form action={add} className="space-y-2">
          {result.note && <p className="text-muted-foreground">{result.note}</p>}
          {result.suggestions.length === 0 ? (
            <p className="text-muted-foreground">No new ideas right now.</p>
          ) : (
            <>
              <ul className="space-y-1">
                {result.suggestions.map((s, i) => (
                  <li key={s.text}>
                    <label className="flex items-start gap-2">
                      <input type="checkbox" name="pick" value={i} defaultChecked={s.intent === "COMMERCIAL"} className="mt-1" />
                      <span>
                        {s.text} <span className="text-xs text-muted-foreground">· {INTENTS[s.intent]?.toLowerCase()} · {ORIGIN[s.origin]}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <input type="hidden" name="suggestions" value={JSON.stringify(result.suggestions)} />
              <Button size="sm">Add selected prompts</Button>
            </>
          )}
        </form>
      )}
    </Card>
  );
}
