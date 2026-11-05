import Link from "next/link";
import { AnswerText } from "@/components/answer-text";
import { KindTag } from "@/components/tables";
import { api } from "@/lib/api";
import { ENGINES, fmtDateTime } from "@/lib/format";
import type { Kind } from "@/lib/types";

type Detail = {
  id: string;
  model: string;
  status: "OK" | "NO_AI_RESULT" | "FAILED";
  provider: string;
  text: string | null;
  error: string | null;
  capturedAt: string;
  costCredits: string | null;
  prompt: { id: string; text: string };
  mentions: { entityId: string; name: string; kind: Kind; rank: number; totalInAnswer: number; score: number; sentiment: string | null; summary: string }[];
  citations: { id: string; url: string; title: string | null; domain: string; position: number; ownerType: string; searchResult: boolean }[];
  fanout: { id: string; query: string; kind: string }[];
};

export default async function ChatDetail({ params }: { params: Promise<{ id: string; answerId: string }> }) {
  const { id, answerId } = await params;
  const a = await api<Detail>(`/brands/${id}/answers/${answerId}`);
  const ranked = a.mentions.filter((m) => m.rank > 0);
  const others = a.mentions.filter((m) => m.rank === 0);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/brands/${id}/prompts/${a.prompt.id}`} className="text-sm text-neutral-500 underline">All answers to this prompt</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{a.prompt.text}</h1>
        <p className="text-sm text-neutral-500">
          {ENGINES[a.model]} · {fmtDateTime(a.capturedAt)} · captured via {a.provider}
          {a.costCredits && ` · ${Number(a.costCredits)} credits`}
        </p>
      </div>

      {a.status !== "OK" ? (
        <p className="rounded-lg border bg-white p-4 text-sm text-neutral-600">
          {a.status === "NO_AI_RESULT" ? "The engine showed no AI answer for this search." : `Capture failed: ${a.error ?? "unknown error"}`}
        </p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
          <article className="rounded-lg border bg-white p-4 text-sm">
            <AnswerText text={a.text ?? ""} marks={a.mentions} />
          </article>
          <aside className="space-y-6 text-sm">
            <section className="space-y-2">
              <h3 className="font-medium">Companies named</h3>
              {ranked.length === 0 && <p className="text-neutral-500">No companies recommended.</p>}
              <ol className="space-y-2">
                {ranked.map((m) => (
                  <li key={m.entityId} className="rounded border bg-white p-2">
                    <span className="font-medium">#{m.rank} {m.name}</span>
                    <KindTag kind={m.kind} />
                    <span className="block text-xs text-neutral-500">
                      score {m.score}
                      {m.sentiment && ` · ${m.sentiment.toLowerCase()}`}
                    </span>
                    {m.summary && <span className="block text-xs text-neutral-600">{m.summary}</span>}
                  </li>
                ))}
              </ol>
              {others.length > 0 && <p className="text-xs text-neutral-500">Also mentioned, not recommended: {others.map((m) => m.name).join(", ")}</p>}
            </section>
            {(
              [
                ["Sources the AI cited", a.citations.filter((c) => !c.searchResult)],
                ["Google search results shown with it", a.citations.filter((c) => c.searchResult)],
              ] as const
            ).map(([label, list]) =>
              list.length > 0 ? (
                <section key={label} className="space-y-2">
                  <h3 className="font-medium">
                    {label} ({list.length})
                  </h3>
                  <ol className="list-decimal space-y-1 pl-5">
                    {list.map((c) => (
                      <li key={c.id} className="break-words">
                        <a href={c.url} target="_blank" rel="noopener noreferrer" className="underline">{c.title || c.domain}</a>
                        {c.ownerType !== "THIRD_PARTY" && <span className="text-xs text-neutral-500"> · {c.ownerType === "SELF" ? "your site" : "competitor"}</span>}
                      </li>
                    ))}
                  </ol>
                </section>
              ) : null,
            )}
            {a.fanout.length > 0 && (
              <section className="space-y-2">
                <h3 className="font-medium">Searches the AI ran</h3>
                <ul className="list-disc space-y-1 pl-5 text-neutral-700">
                  {a.fanout.map((q) => <li key={q.id}>{q.query}</li>)}
                </ul>
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
