import type { Metadata } from "next";

// Share reports are white-label: no product name anywhere, including the tab title of not-found pages.
export const metadata: Metadata = { title: "AI visibility report", robots: { index: false } };

export default function ReportLayout({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto max-w-6xl p-6">{children}</main>;
}
