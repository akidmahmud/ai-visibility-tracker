"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function SignIn() {
  const router = useRouter();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email"));
    const password = String(f.get("password"));
    setPending(true);
    setError(null);
    const { error } =
      mode === "in"
        ? await authClient.signIn.email({ email, password })
        : await authClient.signUp.email({ email, password, name: String(f.get("name")) });
    setPending(false);
    if (error) return setError(error.message ?? "Something went wrong. Try again.");
    router.replace("/");
    router.refresh();
  }

  return (
    <section className="mx-auto mt-12 max-w-sm space-y-4 rounded-lg border bg-white p-6">
      <h1 className="text-xl font-semibold">{mode === "in" ? "Sign in" : "Create account"}</h1>
      <form onSubmit={submit} className="space-y-3">
        {mode === "up" && (
          <label className="block text-sm">
            Name
            <input name="name" required autoComplete="name" className="mt-1 w-full rounded border px-3 py-2" />
          </label>
        )}
        <label className="block text-sm">
          Email
          <input name="email" type="email" required autoComplete="email" className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded border px-3 py-2"
          />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button disabled={pending} className="w-full">
          {mode === "in" ? "Sign in" : "Create account"}
        </Button>
      </form>
      <Button type="button" variant="link" onClick={() => setMode(mode === "in" ? "up" : "in")}>
        {mode === "in" ? "No account? Create one" : "Have an account? Sign in"}
      </Button>
    </section>
  );
}
