import { Suspense } from "react";
import { api, requireSession } from "@/lib/api";
import { Sidebar } from "./sidebar";

type Ws = { name: string; whiteLabel: { agencyName?: string } | null };

export const isSuperAdmin = (email: string) =>
  (process.env.SUPER_ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean).includes(email.toLowerCase());

/**
 * Signed-in chrome: sidebar + optional top bar. `brandId` selects the brand the sidebar links to;
 * workspace pages pass none and fall back to the first brand.
 */
export async function AppShell({ brandId, topbar, children }: { brandId?: string; topbar?: React.ReactNode; children: React.ReactNode }) {
  const { user } = await requireSession();
  const [ws, brands] = await Promise.all([api<Ws>("/workspace").catch(() => null), api<{ id: string }[]>("/brands").catch(() => [])]);
  const current = brandId ?? brands[0]?.id ?? null;
  const todos = current ? await api<unknown[]>(`/brands/${current}/todos?status=SUGGESTED`).catch(() => []) : [];
  return (
    <div className="flex min-h-screen">
      <Suspense>
        <Sidebar
          appName={ws?.whiteLabel?.agencyName || ws?.name || "AI Visibility"}
          brandId={current}
          todoCount={todos.length}
          isAdmin={isSuperAdmin(user.email)}
          email={user.email}
          name={user.name}
        />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar && <header className="no-print sticky top-0 z-20 flex min-h-14 flex-wrap items-center gap-3 border-b bg-white/90 px-6 py-2 backdrop-blur">{topbar}</header>}
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}

/** Page title block used at the top of every page. */
export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em]">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
