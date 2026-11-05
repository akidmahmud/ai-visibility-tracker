import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Secrets at rest (OAuth refresh tokens) and signed OAuth state. Key: ENCRYPTION_KEY, else derived from BETTER_AUTH_SECRET.
const key = () => createHash("sha256").update(process.env.ENCRYPTION_KEY || process.env.BETTER_AUTH_SECRET || "").digest();

/** AES-256-GCM; output is iv.tag.ciphertext in base64url. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string): string {
  const [iv, tag, data] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString("utf8");
}

const sign = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

/** OAuth state bound to a workspace, valid for 15 minutes. */
export function makeState(workspaceId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ w: workspaceId, t: now })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readState(state: string, now = Date.now()): string | null {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const { w, t } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { w: string; t: number };
  return now - t < 15 * 60_000 ? w : null;
}
