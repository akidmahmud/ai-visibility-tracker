import { PageHeader } from "@/components/shell/app-shell";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { PromptSuggestions, type Suggestions } from "@/components/prompt-suggestions";
import { RunProgress } from "@/components/run-progress";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/form";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/api";
import { getBrand } from "@/lib/brand";
import { filterQuery, fmtDateTime, INTENTS, pct, pos, readFilters, vis } from "@/lib/format";
import type { PromptMetrics } from "@/lib/types";

type Run = { id: string; status: string; createdAt: string; promptCount: number; answerCount: number; errorCount: number; credits: number; note: string | null };
type Topic = { id: string; name: string; promptCount: number };
type Props = { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

const DAY = 24 * 3600 * 1000;

/** Module-level so server actions can call it: a function captured from the page body can't be serialized. */
function refreshBrand(id: string) {
  revalidatePath(`/brands/${id}`, "layout");
}

export default async function PromptsPage({ params, searchParams }: Props) {
  const { id } = await params;
  const f = readFilters(await searchParams);
  const qs = filterQuery(f);
  const [brand, metrics, runs, topics] = await Promise.all([
    getBrand(id),
    api<PromptMetrics>(`/brands/${id}/prompt-metrics?${qs}`),
    api<Run[]>(`/brands/${id}/runs`),
    api<Topic[]>(`/brands/${id}/topics`),
  ]);

  async function addPrompts(form: FormData) {
    "use server";
    const texts = String(form.get("texts")).split("\n").map((t) => t.trim()).filter(Boolean);
    const topicId = String(form.get("topicId") ?? "") || undefined;
    const location = String(form.get("location") ?? "").trim() || undefined;
    if (texts.length) await api(`/brands/${id}/prompts`, { method: "POST", body: JSON.stringify({ texts, intent: form.get("intent"), topicId, location }) });
    refreshBrand(id);
  }
  async function updatePrompt(form: FormData) {
    "use server";
    const body: Record<string, unknown> = {};
    if (form.has("isActive")) body.isActive = form.get("isActive") === "true";
    if (form.has("topicId")) body.topicId = String(form.get("topicId")) || null;
    if (form.has("intent")) body.intent = form.get("intent");
    await api(`/brands/${id}/prompts/${form.get("promptId")}`, { method: "PATCH", body: JSON.stringify(body) });
    refreshBrand(id);
  }
  async function remove(form: FormData) {
    "use server";
    await api(`/brands/${id}/prompts/${form.get("promptId")}`, { method: "DELETE" });
    refreshBrand(id);
  }
  async function addTopic(form: FormData) {
    "use server";
    await api(`/brands/${id}/topics`, { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
    refreshBrand(id);
  }
  async function removeTopic(form: FormData) {
    "use server";
    await api(`/brands/${id}/topics/${form.get("topicId")}`, { method: "DELETE" });
    refreshBrand(id);
  }
  async function suggest(_prev: Suggestions | null, form: FormData): Promise<Suggestions> {
    "use server";
    return api<Suggestions>(`/brands/${id}/prompts/suggest`, { method: "POST", body: JSON.stringify({ google: form.get("google") === "on" }) }).catch(() => ({ error: "Suggestions failed. Try again in a minute." }));
  }
  async function addSuggested(form: FormData) {
    "use server";
    const all = JSON.parse(String(form.get("suggestions"))) as { text: string; intent: string; source: string }[];
    const picked = form.getAll("pick").map((i) => all[Number(i)]).filter((s) => !!s);
    // one request per intent + source, since a batch shares both
    for (const group of Map.groupBy(picked, (s) => `${s.intent}|${s.source}`).values()) {
      await api(`/brands/${id}/prompts`, {
        method: "POST",
        body: JSON.stringify({ texts: group.map((s) => s.text), intent: group[0]!.intent, source: group[0]!.source }),
      });
    }
    refreshBrand(id);
  }
  async function runNow() {
    "use server";
    await api(`/brands/${id}/run-now`, { method: "POST" });
    refreshBrand(id);
  }

  const active = metrics.prompts.filter((p) => p.isActive).length;
  const locked = brand.lastManualRunAt && Date.now() - new Date(brand.lastManualRunAt).getTime() < DAY;
  const filtered = f.topics.length || f.intents.length;

  return (
    <div className="space-y-8">
      <PageHeader title="Prompts" description="The questions tracked in every AI engine. Add your own, take suggestions, group them by topic." />
      <Card className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
        <p className="text-muted-foreground">
          {active} active prompts × {brand.enabledModels.length} engines, run {brand.frequency.toLowerCase().replaceAll("_", " ")}
          {brand.nextRunAt && <> · next run {fmtDateTime(brand.nextRunAt)}</>}
        </p>
        <form action={runNow}>
          <Button disabled={!!locked || !active} title={locked ? "Run now is available once every 24 hours" : undefined}>Run now</Button>
        </form>
      </Card>
      <RunProgress brandId={id} engines={brand.enabledModels.length} />

      <section className="space-y-2">
        <h2 className="font-semibold">
          Prompts ({metrics.prompts.length}){filtered ? " matching the filters" : ""}
        </h2>
        {metrics.prompts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{filtered ? "No prompts match these filters." : "No prompts yet. Add the questions your buyers ask below."}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prompt</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead>Intent</TableHead>
                <TableHead numeric>Visibility</TableHead>
                <TableHead numeric>Mentioned in</TableHead>
                <TableHead numeric>Avg position</TableHead>
                <TableHead numeric>Sources</TableHead>
                <TableHead><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.prompts.map((p) => (
                <TableRow key={p.id} className={p.isActive ? undefined : "text-muted-foreground"}>
                  <TableCell className="max-w-sm">
                    <Link href={`/brands/${id}/prompts/${p.id}?${qs}`} className="hover:underline">{p.text}</Link>
                    {!p.isActive && <span className="ml-1 text-xs">(paused)</span>}
                    {p.location && <span className="block text-xs text-muted-foreground">📍 {p.location}</span>}
                  </TableCell>
                  <TableCell>
                    <form action={updatePrompt}>
                      <input type="hidden" name="promptId" value={p.id} />
                      <AutoSubmitSelect name="topicId" defaultValue={p.topicId ?? ""} aria-label={`Topic for: ${p.text}`} className="max-w-36 text-xs">
                        <option value="">No topic</option>
                        {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </AutoSubmitSelect>
                    </form>
                  </TableCell>
                  <TableCell>
                    <form action={updatePrompt}>
                      <input type="hidden" name="promptId" value={p.id} />
                      <AutoSubmitSelect name="intent" defaultValue={p.intent} aria-label={`Intent for: ${p.text}`} className="text-xs">
                        {Object.entries(INTENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </AutoSubmitSelect>
                    </form>
                  </TableCell>
                  <TableCell numeric>{p.answers ? vis(p.visibility) : "–"}</TableCell>
                  <TableCell numeric>{p.answers ? pct(p.mentionRate) : "–"}</TableCell>
                  <TableCell numeric>{pos(p.avgPosition)}</TableCell>
                  <TableCell numeric>{p.citations}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">
                    <form action={updatePrompt} className="inline">
                      <input type="hidden" name="promptId" value={p.id} />
                      <input type="hidden" name="isActive" value={String(!p.isActive)} />
                      <Button variant="link">{p.isActive ? "Pause" : "Resume"}</Button>
                    </form>
                    <form action={remove} className="ml-3 inline">
                      <input type="hidden" name="promptId" value={p.id} />
                      <Button variant="link" aria-label={`Remove prompt: ${p.text}`}>Remove</Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <Card className="space-y-3 p-4 text-sm">
          <form action={addPrompts} className="space-y-2">
            <Label htmlFor="texts" className="block font-medium">Add prompts, one per line</Label>
            <Textarea id="texts" name="texts" required rows={4} placeholder="Best AEO agency for a law firm in Phoenix?" />
            <div className="flex flex-wrap items-center gap-3">
              <Label className="flex items-center gap-2">
                Intent
                <Select name="intent" defaultValue="COMMERCIAL">
                  {Object.entries(INTENTS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Label>
              <Label className="flex items-center gap-2">
                Topic
                <Select name="topicId" defaultValue="">
                  <option value="">No topic</option>
                  {topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Label>
              <Label className="flex items-center gap-2">
                Location
                <Input name="location" maxLength={200} placeholder="optional, e.g. Phoenix, AZ" className="w-48" />
              </Label>
              <Button>Add prompts</Button>
            </div>
          </form>
        </Card>
        <PromptSuggestions suggest={suggest} add={addSuggested} />
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Topics ({topics.length})</h2>
        <p className="text-sm text-muted-foreground">Group prompts (for example by service or city) to filter every page by topic.</p>
        {topics.length > 0 && (
          <ul className="flex flex-wrap gap-2 text-sm">
            {topics.map((t) => (
              <li key={t.id} className="flex items-center gap-2 rounded-full border bg-card py-1 pl-3 pr-2">
                {t.name} <span className="text-xs text-muted-foreground">{t.promptCount}</span>
                <form action={removeTopic}>
                  <input type="hidden" name="topicId" value={t.id} />
                  <button aria-label={`Delete topic ${t.name}`} className="px-1 text-muted-foreground hover:text-foreground">×</button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addTopic} className="flex max-w-md gap-2">
          <Label htmlFor="topic-name" className="sr-only">New topic</Label>
          <Input id="topic-name" name="name" required maxLength={100} placeholder="New topic, e.g. Phoenix" />
          <Button variant="outline">Add topic</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Status</TableHead>
                <TableHead numeric>Answers</TableHead>
                <TableHead numeric>Failed</TableHead>
                <TableHead numeric>Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{fmtDateTime(r.createdAt)}</TableCell>
                  <TableCell>
                    {r.status.toLowerCase()}
                    {r.note && <span className="block text-xs text-muted-foreground">{r.note}</span>}
                  </TableCell>
                  <TableCell numeric>{r.answerCount}</TableCell>
                  <TableCell numeric>{r.errorCount}</TableCell>
                  <TableCell numeric>{r.credits}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
