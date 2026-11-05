"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

type Org = { id: string; name: string };

/** Shown when the session has no active organization: pick an existing one or create the agency workspace. */
export function WorkspacePicker({ orgs }: { orgs: Org[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const done = () => router.refresh();

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget).get("name")).trim();
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 6)}`;
    const { error } = await authClient.organization.create({ name, slug });
    if (error) return setError(error.message ?? "Could not create the workspace.");
    done();
  }

  return (
    <section className="space-y-6">
      {orgs.length > 0 && (
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Choose a workspace</h1>
          <ul className="divide-y rounded-lg border bg-white">
            {orgs.map((o) => (
              <li key={o.id}>
                <button
                  className="w-full p-4 text-left hover:bg-neutral-50"
                  onClick={async () => {
                    await authClient.organization.setActive({ organizationId: o.id });
                    done();
                  }}
                >
                  {o.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form onSubmit={create} className="space-y-3 rounded-lg border bg-white p-4">
        <h2 className="font-semibold">{orgs.length ? "Or create a new workspace" : "Create your agency workspace"}</h2>
        <label className="block text-sm">
          Agency name
          <input name="name" required maxLength={100} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button>Create workspace</Button>
      </form>
    </section>
  );
}
