import type { Metadata } from "next";
import { Google_Sans, Google_Sans_Code } from "next/font/google";
import { Providers } from "./providers";
import "./globals.css";

const sans = Google_Sans({ subsets: ["latin"], variable: "--font-ui" });
const mono = Google_Sans_Code({ subsets: ["latin"], variable: "--font-num" });

export const metadata: Metadata = { title: "AI Visibility Tracker" };

// Chrome lives in AppShell (signed-in pages); share-link reports and sign-in render bare.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-neutral-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
