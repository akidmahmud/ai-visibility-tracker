import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Google redirects here after consent; the code is handed to the API with the user's session, then back to Integrations. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/settings/integrations?${q}`, url), 302);
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent("Google sign-in was cancelled.")}`);

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return Response.redirect(new URL("/sign-in", url), 302);
  const res = await fetch(`${process.env.API_URL}/integrations/google/callback`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.session.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ code: url.searchParams.get("code"), state: url.searchParams.get("state") }),
  });
  if (!res.ok) return back(`error=${encodeURIComponent("Connecting Google failed. Try again.")}`);
  return back("google=connected");
}
