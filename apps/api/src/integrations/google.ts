// Google OAuth + Search Console + GA4 over plain HTTPS (no SDK). Read-only scopes.
export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/analytics.readonly",
];

const env = () => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/integrations/google/callback`;
  return clientId && clientSecret ? { clientId, clientSecret, redirectUri } : null;
};
export const googleConfigured = () => env() !== null;

export function authUrl(state: string) {
  const e = env()!;
  const p = new URLSearchParams({
    client_id: e.clientId,
    redirect_uri: e.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function token(body: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams(body) });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; scope?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new Error(`Google token error: ${json.error_description ?? res.status}`);
  return json;
}

export async function exchangeCode(code: string) {
  const e = env()!;
  const t = await token({ code, client_id: e.clientId, client_secret: e.clientSecret, redirect_uri: e.redirectUri, grant_type: "authorization_code" });
  const claims = JSON.parse(Buffer.from(t.id_token!.split(".")[1]!, "base64url").toString()) as { email: string };
  return { refreshToken: t.refresh_token!, email: claims.email, scopes: t.scope ?? GOOGLE_SCOPES.join(" ") };
}

export async function accessToken(refreshToken: string) {
  const e = env()!;
  return (await token({ refresh_token: refreshToken, client_id: e.clientId, client_secret: e.clientSecret, grant_type: "refresh_token" })).access_token!;
}

async function gget<T>(url: string, access: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json", ...init.headers } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

/** Search Console properties the account can read. */
export async function gscSites(access: string) {
  const r = await gget<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>("https://www.googleapis.com/webmasters/v3/sites", access);
  return (r.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser").map((s) => s.siteUrl);
}

/** Top search queries for a property over the last `days` days. */
export async function gscQueries(access: string, siteUrl: string, days = 90) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const d = (x: Date) => x.toISOString().slice(0, 10);
  const r = await gget<{ rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    access,
    { method: "POST", body: JSON.stringify({ startDate: d(start), endDate: d(end), dimensions: ["query"], rowLimit: 1000 }) },
  );
  return (r.rows ?? []).map((row) => ({ query: row.keys[0]!, clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position }));
}

/** GA4 properties the account can read (for the brand → property mapping). */
export async function ga4Properties(access: string) {
  const r = await gget<{ accountSummaries?: { displayName: string; propertySummaries?: { property: string; displayName: string }[] }[] }>(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    access,
  );
  return (r.accountSummaries ?? []).flatMap((a) => (a.propertySummaries ?? []).map((p) => ({ id: p.property, name: `${a.displayName} › ${p.displayName}` })));
}

/** GA4 sessions per source over `days`; the caller keeps the AI assistants' referrers. */
export async function ga4SessionsBySource(access: string, propertyId: string, days = 90) {
  const r = await gget<{ rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] }>(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
    access,
    {
      method: "POST",
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: "today" }],
        dimensions: [{ name: "date" }, { name: "sessionSource" }],
        metrics: [{ name: "sessions" }, { name: "keyEvents" }],
        limit: 100000,
      }),
    },
  );
  return (r.rows ?? []).map((row) => ({
    date: row.dimensionValues[0]!.value,
    source: row.dimensionValues[1]!.value,
    sessions: Number(row.metricValues[0]!.value),
    conversions: Number(row.metricValues[1]!.value),
  }));
}
