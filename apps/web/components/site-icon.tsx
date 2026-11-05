"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const TINTS = ["bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500", "bg-violet-500", "bg-cyan-600", "bg-orange-500"];
const ENGINE_SITES: Record<string, string> = {
  chatgpt: "chatgpt.com",
  gemini: "gemini.google.com",
  perplexity: "perplexity.ai",
  google_aio: "google.com",
  google_ai_mode: "google.com",
  copilot: "copilot.microsoft.com",
  claude: "claude.ai",
};

/** Site favicon (via Google's favicon service), or a colored initial when there is no domain or it fails to load. */
export function SiteIcon({ domain, name, size = 20, className }: { domain?: string | null; name: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size };
  if (!domain || failed) {
    const tint = TINTS[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % TINTS.length];
    return (
      <span aria-hidden style={{ ...box, fontSize: size * 0.5 }} className={cn("grid shrink-0 place-items-center rounded-md font-semibold uppercase text-white", tint, className)}>
        {name.slice(0, 1)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
      alt=""
      style={box}
      className={cn("shrink-0 rounded-md bg-white object-contain", className)}
      onError={() => setFailed(true)}
    />
  );
}

export const EngineIcon = ({ model, size = 18 }: { model: string; size?: number }) => <SiteIcon domain={ENGINE_SITES[model]} name={model} size={size} />;
