import { PageHeader } from "@/components/shell/app-shell";
import { revalidatePath } from "next/cache";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";
import { ENGINES, fmtDateTime } from "@/lib/format";

type Todo = {
  id: string;
  ruleId: string;
  title: string;
  detail: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  effort: "S" | "M" | "L";
  type: string;
  category: string;
  models: string[];
  status: "SUGGESTED" | "TODO" | "DONE" | "ARCHIVED";
  evidence: Record<string, unknown>;
  updatedAt: string;
};
type SiteCheck = {
  checkedAt: string;
  results: { homepageReachable: boolean; blockedBots: string[]; hasLlmsTxt: boolean; hasOrganizationSchema: boolean; hasFaqSchema: boolean };
};

const COLUMNS = [
  ["SUGGESTED", "Suggested"],
  ["TODO", "To do"],
  ["DONE", "Done"],
  ["ARCHIVED", "Archived"],
] as const;
const PRIORITY_BADGE = { HIGH: "danger", MEDIUM: "warning", LOW: "outline" } as const;
const EFFORT = { S: "Quick", M: "A few days", L: "Larger project" };
const NEXT: Record<Todo["status"], [Todo["status"], string][]> = {
  SUGGESTED: [["TODO", "Accept"], ["ARCHIVED", "Dismiss"]],
  TODO: [["DONE", "Mark done"], ["ARCHIVED", "Archive"]],
  DONE: [["TODO", "Reopen"]],
  ARCHIVED: [["SUGGESTED", "Restore"]],
};

/** Evidence keys in plain words; values as the numbers that triggered the todo. */
function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const label = (k: string) => k.replace(/([A-Z])/g, " $1").toLowerCase();
  const value = (v: unknown) =>
    typeof v === "boolean" ? (v ? "Yes" : "No") : Array.isArray(v) ? v.join(", ") : typeof v === "number" && v > 0 && v < 1 ? `${Math.round(v * 100)}%` : typeof v === "string" && v in ENGINES ? ENGINES[v] : String(v);
  const rows = Object.entries(evidence).filter(([k, v]) => k !== "checkedAt" && v !== null && v !== "" && !(Array.isArray(v) && !v.length));
  if (!rows.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded bg-muted p-2 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted-foreground">{label(k)}</dt>
          <dd className="tabular-nums">{value(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function ActionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [todos, { check }] = await Promise.all([api<Todo[]>(`/brands/${id}/todos`), api<{ check: SiteCheck | null }>(`/brands/${id}/site-check`)]);

  async function move(form: FormData) {
    "use server";
    await api(`/brands/${id}/todos/${form.get("todoId")}`, { method: "PATCH", body: JSON.stringify({ status: form.get("status") }) });
    revalidatePath(`/brands/${id}/actions`);
  }
  async function regenerate() {
    "use server";
    await api(`/brands/${id}/todos/generate`, { method: "POST" });
    revalidatePath(`/brands/${id}/actions`);
  }
  async function recheck() {
    "use server";
    await api(`/brands/${id}/site-check`, { method: "POST" });
    revalidatePath(`/brands/${id}/actions`);
  }

  const r = check?.results;
  const checks: [string, boolean, string][] = r
    ? [
        ["AI crawlers allowed in robots.txt", r.blockedBots.length === 0, r.blockedBots.length ? `Blocked: ${r.blockedBots.join(", ")}` : "GPTBot, ClaudeBot, PerplexityBot and Google-Extended can read the site"],
        ["llms.txt file", r.hasLlmsTxt, r.hasLlmsTxt ? "Found at /llms.txt" : "No /llms.txt"],
        ["Organization schema on the homepage", r.hasOrganizationSchema, r.hasOrganizationSchema ? "Found" : "Missing"],
        ["FAQ schema on the homepage", r.hasFaqSchema, r.hasFaqSchema ? "Found" : "Missing"],
      ]
    : [];

  return (
    <div className="space-y-8">
      <PageHeader title="To-dos" description="Your AI visibility action plan, built from citation patterns, competitor gaps and prompt performance." />
      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Site checkup</h2>
          <form action={recheck}>
            <Button variant="outline" size="sm">Run check now</Button>
          </form>
        </div>
        {!check ? (
          <p className="text-sm text-muted-foreground">Not checked yet. Checks run weekly, or now with the button above (results appear in about a minute).</p>
        ) : !r?.homepageReachable ? (
          <p className="text-sm text-muted-foreground">The homepage couldn't be reached on {fmtDateTime(check.checkedAt)}, so nothing was checked.</p>
        ) : (
          <Card className="divide-y text-sm">
            {checks.map(([name, ok, note]) => (
              <div key={name} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span>
                  {name}
                  <span className="block text-xs text-muted-foreground">{note}</span>
                </span>
                <Badge variant={ok ? "success" : "danger"}>{ok ? "✓ Pass" : "✕ Fix"}</Badge>
              </div>
            ))}
            <p className="p-3 text-xs text-muted-foreground">Checked {fmtDateTime(check.checkedAt)}. Fixed items close their todo on the next check.</p>
          </Card>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Action plan</h2>
          <form action={regenerate}>
            <Button variant="outline" size="sm">Rebuild plan</Button>
          </form>
        </div>
        <p className="text-sm text-muted-foreground">Built weekly from your latest runs. Each item shows the numbers behind it.</p>
        {todos.length === 0 ? (
          <p className="text-sm text-muted-foreground">No actions yet. They appear after the first run and site check.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-4">
            {COLUMNS.map(([status, label]) => {
              const items = todos.filter((t) => t.status === status);
              return (
                <div key={status} className="space-y-2">
                  <h3 className="text-sm font-medium">
                    {label} <span className="text-muted-foreground">{items.length}</span>
                  </h3>
                  {items.map((t) => (
                    <Card key={t.id} className="space-y-1 p-3 text-sm">
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={PRIORITY_BADGE[t.priority]}>{t.priority.toLowerCase()}</Badge>
                        <Badge variant="outline">{t.category}</Badge>
                        <Badge variant="outline">{EFFORT[t.effort]}</Badge>
                      </div>
                      <p className="font-medium">{t.title}</p>
                      <p className="text-muted-foreground">{t.detail}</p>
                      <Evidence evidence={t.evidence} />
                      <div className="flex gap-3 pt-1">
                        {NEXT[t.status].map(([to, text]) => (
                          <form key={to} action={move}>
                            <input type="hidden" name="todoId" value={t.id} />
                            <input type="hidden" name="status" value={to} />
                            <Button variant="link" size="sm">{text}</Button>
                          </form>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
