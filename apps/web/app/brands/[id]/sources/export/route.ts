import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** Proxies the CSV export so the browser download carries the user's session. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return new Response("Sign in first", { status: 401 });
  const qs = new URL(req.url).searchParams;
  qs.set("format", "csv");
  const res = await fetch(`${process.env.API_URL}/brands/${id}/sources?${qs}`, {
    headers: { Authorization: `Bearer ${session.session.token}` },
    cache: "no-store",
  });
  return new Response(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "text/csv",
      "Content-Disposition": res.headers.get("content-disposition") ?? 'attachment; filename="sources.csv"',
    },
  });
}
