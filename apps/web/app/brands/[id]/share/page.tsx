import { PageHeader } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { api } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";

type Link = { id: string; token: string; visibleTabs: string[]; revokedAt: string | null; createdAt: string; openCount: number; lastOpenedAt: string | null };

const TABS = [
  ["dashboard", "Dashboard"],
  ["prompts", "Prompts"],
  ["competitors", "Competitors"],
  ["sources", "Sources"],
] as const;

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const links = await api<Link[]>(`/brands/${id}/share-links`);
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  async function create(form: FormData) {
    "use server";
    const visibleTabs = TABS.map(([t]) => t).filter((t) => form.get(t) === "on");
    if (visibleTabs.length) await api(`/brands/${id}/share-links`, { method: "POST", body: JSON.stringify({ visibleTabs }) });
    revalidatePath(`/brands/${id}/share`);
  }
  async function revoke(form: FormData) {
    "use server";
    await api(`/brands/${id}/share-links/${form.get("linkId")}`, { method: "DELETE" });
    revalidatePath(`/brands/${id}/share`);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Share links" description="Read-only client reports with your agency branding." />
      <section className="space-y-2">
        <h2 className="font-semibold">Share a read-only report</h2>
        <p className="text-sm text-neutral-600">Anyone with the link can view the pages you choose, without signing in. Revoke it any time.</p>
        <form action={create} className="flex flex-wrap items-center gap-4 rounded-lg border bg-white p-4 text-sm">
          {TABS.map(([t, label]) => (
            <label key={t} className="flex items-center gap-2">
              <input type="checkbox" name={t} defaultChecked /> {label}
            </label>
          ))}
          <Button>Create link</Button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">Links</h2>
        {links.length === 0 ? (
          <p className="text-sm text-neutral-500">No share links yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border bg-white text-sm">
            {links.map((l) => {
              const url = `${origin}/r/${l.token}`;
              return (
                <li key={l.id} className={`space-y-1 p-3 ${l.revokedAt ? "text-neutral-400" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {l.revokedAt ? (
                      <span className="break-all line-through">{url}</span>
                    ) : (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="break-all underline">{url}</a>
                    )}
                    {!l.revokedAt && (
                      <form action={revoke}>
                        <input type="hidden" name="linkId" value={l.id} />
                        <Button variant="link">Revoke</Button>
                      </form>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500">
                    {l.visibleTabs.join(", ")} · created {fmtDateTime(l.createdAt)} · opened {l.openCount} {l.openCount === 1 ? "time" : "times"}
                    {l.lastOpenedAt && `, last ${fmtDateTime(l.lastOpenedAt)}`}
                    {l.revokedAt && ` · revoked ${fmtDateTime(l.revokedAt)}`}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
