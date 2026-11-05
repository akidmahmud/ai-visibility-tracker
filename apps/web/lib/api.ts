import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** Current session, or redirect to sign-in. Use at the top of every protected page and action. */
export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  return session;
}

/** Server-side call to the NestJS API, authenticated with the user's session token. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { session } = await requireSession();
  const res = await fetch(`${process.env.API_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}`, ...init.headers },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return (res.status === 204 ? undefined : await res.json()) as T;
}
