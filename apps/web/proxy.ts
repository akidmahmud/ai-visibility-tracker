import { type NextRequest, NextResponse } from "next/server";

// Agencies point their own report domain (e.g. reports.agency.com) at this app. On those hosts only share
// reports are served; the product itself lives on the app host. The report page also checks that the link
// belongs to the agency that owns the domain.
const APP_HOSTS = new Set([new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000").host, "localhost:3000", "127.0.0.1:3000"]);

export default function proxy(req: NextRequest) {
  const host = req.headers.get("host") ?? "";
  if (APP_HOSTS.has(host)) return NextResponse.next();
  const path = req.nextUrl.pathname;
  if (path.startsWith("/r/") || path.startsWith("/_next/") || path === "/favicon.ico") return NextResponse.next();
  return new NextResponse("Not found", { status: 404 });
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
