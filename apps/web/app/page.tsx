import { ArrowRight, Plus } from "lucide-react";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AppShell, PageHeader } from "@/components/shell/app-shell";
import { SiteIcon } from "@/components/site-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { api, requireSession } from "@/lib/api";
import { auth } from "@/lib/auth";
import { ENGINES } from "@/lib/format";
import { WorkspacePicker } from "./workspace-picker";

type Brand = { id: string; name: string; domain: string; frequency: string; enabledModels: string[]; isActive: boolean };

async function createBrand(form: FormData) {
  "use server";
  await api("/brands", { method: "POST", body: JSON.stringify({ name: form.get("name"), websiteUrl: form.get("websiteUrl") }) });
  revalidatePath("/");
}

export default async function Home() {
  const { session } = await requireSession();
  if (!session.activeOrganizationId) {
    const orgs = await auth.api.listOrganizations({ headers: await headers() });
    return (
      <main className="mx-auto max-w-xl p-6">
        <WorkspacePicker orgs={orgs.map((o) => ({ id: o.id, name: o.name }))} />
      </main>
    );
  }
  const brands = await api<Brand[]>("/brands");

  return (
    <AppShell>
      <PageHeader title="Brands" description="Every brand this workspace tracks across ChatGPT, Gemini, Perplexity and Google's AI answers." />
      <Card className="mb-6 p-4">
        <form action={createBrand} className="flex flex-wrap items-end gap-3">
          <label className="min-w-56 flex-1 text-sm">
            Brand name
            <Input name="name" required placeholder="Acme Dental" className="mt-1" />
          </label>
          <label className="min-w-56 flex-1 text-sm">
            Website
            <Input name="websiteUrl" required placeholder="acmedental.com" className="mt-1" />
          </label>
          <Button>
            <Plus className="size-4" /> Add brand
          </Button>
        </form>
      </Card>
      {brands.length === 0 ? (
        <p className="text-sm text-muted-foreground">No brands yet. Add the first one above.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {brands.map((b) => (
            <Link key={b.id} href={`/brands/${b.id}`} className="group">
              <Card className="flex h-full flex-col gap-3 p-4 transition-shadow group-hover:shadow-md">
                <div className="flex items-center gap-3">
                  <SiteIcon domain={b.domain} name={b.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{b.name}</p>
                    <p className="truncate text-sm text-muted-foreground">{b.domain}</p>
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-xs text-muted-foreground">
                  {b.isActive ? `Runs ${b.frequency.toLowerCase().replaceAll("_", " ")}` : "Tracking paused"} · {b.enabledModels.map((m) => ENGINES[m] ?? m).join(", ")}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
