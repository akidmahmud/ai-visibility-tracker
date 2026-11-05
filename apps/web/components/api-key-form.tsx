"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";

type Result = { key: string } | { error: string } | null;

/** Creates a key and shows it once; only its hash is stored. */
export function ApiKeyForm({ action }: { action: (prev: Result, form: FormData) => Promise<Result> }) {
  const [result, run, pending] = useActionState(action, null);
  return (
    <div className="space-y-2 text-sm">
      <form action={run} className="flex flex-wrap items-center gap-2">
        <label htmlFor="key-name" className="sr-only">Key name</label>
        <Input id="key-name" name="name" required maxLength={60} placeholder="Name, e.g. Claude Desktop" className="max-w-xs" />
        <label className="flex items-center gap-1">
          <input type="checkbox" name="write" /> Can make changes
        </label>
        <Button disabled={pending}>Create key</Button>
      </form>
      {result && "error" in result && <p role="alert" className="text-destructive">{result.error}</p>}
      {result && "key" in result && (
        <p role="status">
          Copy it now, it won't be shown again:
          <code className="block select-all break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs">{result.key}</code>
        </p>
      )}
    </div>
  );
}
