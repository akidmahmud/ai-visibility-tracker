import type { ReportHeader } from "@/lib/public-report";

/** Agency-branded report title: the agency's logo and name, never ours. */
export function ReportTitle({ header, actions }: { header: ReportHeader; actions?: React.ReactNode }) {
  const wl = header.agency.whiteLabel ?? {};
  return (
    <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
      <div className="space-y-2">
        {wl.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- agency logos are arbitrary external URLs
          <img src={wl.logoUrl} alt={wl.agencyName || header.agency.name} className="h-10 w-auto" />
        ) : (
          <p className="text-sm font-medium text-muted-foreground">{wl.agencyName || header.agency.name}</p>
        )}
        <h1 className="text-xl font-semibold" style={{ color: wl.primaryColor }}>{header.brand.name}: AI visibility report</h1>
        <p className="text-sm text-muted-foreground">How ChatGPT, Gemini, Perplexity and Google AI recommend {header.brand.domain}</p>
      </div>
      {actions}
    </header>
  );
}
