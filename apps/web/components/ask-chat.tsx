"use client";

import { ArrowUp, Sparkles } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { AnswerText } from "@/components/answer-text";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type Ask = (messages: Msg[]) => Promise<{ answer: string } | { error: string }>;

const STARTERS = [
  "Which competitors beat us most often, and on which prompts?",
  "Which prompts never mention us?",
  "Which sites should we try to get listed on first?",
  "Summarize our visibility this month in three bullets.",
];

/** "Ask AI": a chat over the brand's last 30 days. History stays in the browser tab. */
export function AskChat({ brand, ask }: { brand: string; ask: Ask }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLTextAreaElement>(null);

  const send = (text: string) => {
    const q = text.trim();
    if (!q || pending) return;
    const next = [...messages, { role: "user" as const, content: q }];
    setMessages(next);
    setError(null);
    if (input.current) input.current.value = "";
    start(async () => {
      const r = await ask(next);
      if ("error" in r) setError(r.error);
      else setMessages([...next, { role: "assistant", content: r.answer }]);
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      {messages.length === 0 ? (
        <Card className="p-6 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
            <Sparkles className="size-5" />
          </span>
          <h2 className="mt-3 text-lg font-semibold">Ask anything about {brand}&apos;s AI visibility</h2>
          <p className="mt-1 text-sm text-muted-foreground">Answers come from the last 30 days of tracked prompts, competitors, sources and to-dos.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {STARTERS.map((s) => (
              <button key={s} onClick={() => send(s)} className="rounded-lg border p-3 text-left text-sm hover:border-brand/40 hover:bg-neutral-50">
                {s}
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <ol className="space-y-4" aria-live="polite">
          {messages.map((m, i) => (
            <li key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] rounded-2xl px-4 py-3 text-sm", m.role === "user" ? "bg-brand text-white" : "border bg-white")}>
                {m.role === "user" ? m.content : <AnswerText text={m.content} marks={[]} />}
              </div>
            </li>
          ))}
          {pending && <li className="text-sm text-muted-foreground">Thinking…</li>}
        </ol>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input.current?.value ?? "");
        }}
        className="sticky bottom-4 flex items-end gap-2 rounded-2xl border bg-white p-2 shadow-sm"
      >
        <label htmlFor="ask" className="sr-only">Your question</label>
        <textarea
          id="ask"
          ref={input}
          rows={1}
          placeholder="Ask about competitors, prompts, sources…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(e.currentTarget.value);
            }
          }}
          className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none"
        />
        <button aria-label="Send" disabled={pending} className="grid size-9 place-items-center rounded-xl bg-brand text-white disabled:opacity-40">
          <ArrowUp className="size-4" />
        </button>
      </form>
    </div>
  );
}
