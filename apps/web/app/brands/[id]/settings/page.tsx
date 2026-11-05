import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { api } from "@/lib/api";
import { ENGINES, TRACKED_ENGINES } from "@/lib/format";

type Brand = {
  id: string;
  name: string;
  websiteUrl: string;
  aliases: string[];
  description: string | null;
  industry: string | null;
  country: string;
  frequency: string;
  enabledModels: string[];
  isActive: boolean;
  gscProperty: string | null;
  ga4PropertyId: string | null;
};

const FREQUENCIES = [
  ["DAILY", "Every day"],
  ["EVERY_2_DAYS", "Every 2 days"],
  ["EVERY_3_DAYS", "Every 3 days"],
  ["WEEKLY", "Every week"],
  ["MONTHLY", "Every month"],
];

export default async function BrandSettings({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [brand, props] = await Promise.all([
    api<Brand>(`/brands/${id}`),
    api<{ gsc: string[]; ga4: { id: string; name: string }[] }>("/integrations/google/properties"),
  ]);

  async function save(form: FormData) {
    "use server";
    await api(`/brands/${id}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: form.get("name"),
        websiteUrl: form.get("websiteUrl"),
        industry: String(form.get("industry") ?? "") || undefined,
        aliases: String(form.get("aliases") ?? "").split("\n").map((a) => a.trim()).filter(Boolean),
        frequency: form.get("frequency"),
        enabledModels: TRACKED_ENGINES.filter((m) => form.get(`model-${m}`) === "on"),
        isActive: form.get("isActive") === "on",
        ...(form.has("gscProperty") ? { gscProperty: String(form.get("gscProperty")) || null } : {}),
        ...(form.has("ga4PropertyId") ? { ga4PropertyId: String(form.get("ga4PropertyId")) || null } : {}),
      }),
    });
    revalidatePath(`/brands/${id}`, "layout");
  }
  async function remove() {
    "use server";
    await api(`/brands/${id}`, { method: "DELETE" });
    redirect("/");
  }

  const field = "mt-1 w-full rounded border px-3 py-2";
  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader title="Brand settings" description="Name, website, engines, schedule and Google properties for this brand." />
      <form action={save} className="space-y-4 rounded-lg border bg-white p-4 text-sm">
        <label className="block">
          Brand name
          <input name="name" required defaultValue={brand.name} className={field} />
        </label>
        <label className="block">
          Website
          <input name="websiteUrl" required defaultValue={brand.websiteUrl} className={field} />
        </label>
        <label className="block">
          Industry
          <input name="industry" defaultValue={brand.industry ?? ""} className={field} />
        </label>
        <label className="block">
          Other names customers use, one per line
          <textarea name="aliases" rows={3} defaultValue={brand.aliases.join("\n")} className={field} />
          <span className="text-xs text-neutral-500">Answers that use these names count as mentions of {brand.name}.</span>
        </label>
        <label className="block">
          Run prompts
          <select name="frequency" defaultValue={brand.frequency} className={field}>
            {FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <fieldset>
          <legend>AI engines to track</legend>
          <div className="mt-1 flex flex-wrap gap-4">
            {TRACKED_ENGINES.map((m) => (
              <label key={m} className="flex items-center gap-2">
                <input type="checkbox" name={`model-${m}`} defaultChecked={brand.enabledModels.includes(m)} /> {ENGINES[m]}
              </label>
            ))}
          </div>
        </fieldset>
        {(props.gsc.length > 0 || props.ga4.length > 0) && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              Search Console property
              <select name="gscProperty" defaultValue={brand.gscProperty ?? ""} className={field}>
                <option value="">Not linked</option>
                {props.gsc.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              Google Analytics 4 property
              <select name="ga4PropertyId" defaultValue={brand.ga4PropertyId ?? ""} className={field}>
                <option value="">Not linked</option>
                {props.ga4.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isActive" defaultChecked={brand.isActive} /> Tracking is on (untick to pause scheduled runs)
        </label>
        <Button>Save settings</Button>
      </form>

      <form action={remove} className="space-y-2 rounded-lg border border-red-200 bg-white p-4 text-sm">
        <p className="font-medium">Delete this brand</p>
        <p className="text-neutral-600">Stops tracking and hides the brand. Its history is kept and can be restored by support.</p>
        <Button variant="destructive">Delete {brand.name}</Button>
      </form>
    </div>
  );
}
