import { notFound } from "next/navigation";
import { AppShell, isSuperAdmin } from "@/components/shell/app-shell";
import { requireSession } from "@/lib/api";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();
  if (!isSuperAdmin(user.email)) notFound();
  return <AppShell>{children}</AppShell>;
}
