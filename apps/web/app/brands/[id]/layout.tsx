import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { TopBar } from "@/components/shell/topbar";
import { api } from "@/lib/api";
import { getBrand } from "@/lib/brand";

export default async function BrandLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [brand, brands, topics] = await Promise.all([
    getBrand(id),
    api<{ id: string; name: string; domain: string }[]>("/brands"),
    api<{ id: string; name: string }[]>(`/brands/${id}/topics`),
  ]);
  return (
    <AppShell
      brandId={id}
      topbar={
        <Suspense>
          <TopBar brand={brand} brands={brands} topics={topics} models={brand.enabledModels} />
        </Suspense>
      }
    >
      {children}
    </AppShell>
  );
}
