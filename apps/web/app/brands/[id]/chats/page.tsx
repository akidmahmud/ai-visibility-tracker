import { PageHeader } from "@/components/shell/app-shell";
import Link from "next/link";
import { api } from "@/lib/api";
import { ENGINES, filterQuery, fmtDate, readFilters } from "@/lib/format";
import type { AnswerList } from "@/lib/types";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ChatsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const f = readFilters(sp);
  const mentioned = sp.mentioned === "yes" || sp.mentioned === "no" ? sp.mentioned : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const list = await api<AnswerList>(`/brands/${id}/answers?${filterQuery(f, { mentioned, page })}`);
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const link = (extra: Record<string, string | number | undefined>) => `/brands/${id}/chats?${filterQuery(f, { mentioned, page, ...extra })}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Chats" description="Every AI answer captured, with the companies it named and the sources it cited." />
      <div role="group" aria-label="Mentioned filter" className="flex gap-1 text-sm">
        {[
          [undefined, "All chats"],
          ["yes", "You were mentioned"],
          ["no", "You were not mentioned"],
        ].map(([value, label]) => (
          <Link
            key={label}
            href={link({ mentioned: value, page: 1 })}
            aria-current={mentioned === value ? "true" : undefined}
            className={`rounded-full border px-3 py-1 ${mentioned === value ? "border-neutral-900 bg-neutral-900 text-white" : "bg-white hover:bg-neutral-50"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      {list.answers.length === 0 ? (
        <p className="text-sm text-neutral-500">No chats match these filters.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white text-sm">
          {list.answers.map((a) => (
            <li key={a.id}>
              <Link href={`/brands/${id}/chats/${a.id}`} className="block p-3 hover:bg-neutral-50">
                <span className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium">{a.prompt}</span>
                  <span className="text-neutral-600">
                    {a.status === "FAILED" ? "Capture failed" : a.status === "NO_AI_RESULT" ? "No AI answer" : a.selfRank ? `You: #${a.selfRank}` : "Not mentioned"}
                  </span>
                </span>
                <span className="block text-xs text-neutral-500">
                  {ENGINES[a.model]} · {fmtDate(a.capturedAt)} · {a.citations} sources
                </span>
                {a.excerpt && <span className="mt-1 block text-neutral-600">{a.excerpt}…</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between text-sm">
          {page > 1 ? <Link href={link({ page: page - 1 })} className="underline">Previous</Link> : <span />}
          <span className="text-neutral-500">Page {page} of {pages}</span>
          {page < pages ? <Link href={link({ page: page + 1 })} className="underline">Next</Link> : <span />}
        </nav>
      )}
    </div>
  );
}
