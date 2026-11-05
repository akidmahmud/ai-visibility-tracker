import Link from "next/link";
import { api } from "@/lib/api";
import { ENGINES, filterQuery, fmtDate, readFilters } from "@/lib/format";
import type { AnswerList } from "@/lib/types";

type Prompt = { id: string; text: string; intent: string };
type Props = { params: Promise<{ id: string; promptId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

/** One prompt: every answer per engine, newest first, with where the brand placed. */
export default async function PromptDetail({ params, searchParams }: Props) {
  const { id, promptId } = await params;
  const f = readFilters(await searchParams);
  const [prompts, list] = await Promise.all([
    api<Prompt[]>(`/brands/${id}/prompts`),
    api<AnswerList>(`/brands/${id}/answers?${filterQuery({ ...f, days: Math.max(f.days, 90) }, { prompt: promptId })}`),
  ]);
  const prompt = prompts.find((p) => p.id === promptId);
  const byModel = Map.groupBy(list.answers, (a) => a.model);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/brands/${id}/prompts?${filterQuery(f)}`} className="text-sm text-neutral-500 underline">All prompts</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{prompt?.text ?? "Prompt"}</h1>
        <p className="text-sm text-neutral-500">{list.total} answers in the last {Math.max(f.days, 90)} days</p>
      </div>
      {list.answers.length === 0 && <p className="text-sm text-neutral-500">No answers yet for this prompt.</p>}
      {[...byModel.entries()].map(([model, answers]) => (
        <section key={model} className="space-y-2">
          <h3 className="font-medium">{ENGINES[model] ?? model}</h3>
          <ul className="divide-y rounded-lg border bg-white text-sm">
            {answers.map((a) => (
              <li key={a.id}>
                <Link href={`/brands/${id}/chats/${a.id}`} className="flex flex-wrap items-baseline justify-between gap-2 p-3 hover:bg-neutral-50">
                  <span className="text-neutral-600">{fmtDate(a.capturedAt)}</span>
                  <span className="font-medium">
                    {a.status === "FAILED" ? "Capture failed" : a.status === "NO_AI_RESULT" ? "No AI answer shown" : a.selfRank ? `You were #${a.selfRank}` : "You were not mentioned"}
                  </span>
                  <span className="w-full text-neutral-500">{a.excerpt}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
