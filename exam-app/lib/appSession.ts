/**
 * appSession
 * ---------------------------------------------------------------------
 * THE single session mechanism for the whole app under username-only
 * login. When someone logs in with a username (/api/auth/login), a
 * signed HTTP-only cookie is set containing their profile id, their
 * role AT LOGIN TIME, and an expiry. Middleware verifies the signature
 * for routing; every API route and server page then re-loads the
 * profile fresh from the database (lib/auth.ts), so role changes and
 * blocks (is_active = false) take effect on the very next data access
 * even if the cookie itself is still valid.
 *
 * Token format: "<profileId>.<role>.<expiresAtMs>.<hmacHex>"
 *
 * RUNTIME NOTE: imported by middleware.ts (Vercel Edge Runtime) — uses
 * ONLY the Web Crypto API (crypto.subtle), never Node's `crypto` or
 * `Buffer`, which don't exist on Edge. Do not change that.
 *
 * Secret: APP_SESSION_SECRET, falling back to ACCESS_CODE_SECRET so
 * deployments that already set the old variable keep working without
 * any change.
 */
export const APP_SESSION_COOKIE = "app_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function secret(): string {
  const s = process.env.APP_SESSION_SECRET || process.env.ACCESS_CODE_SECRET;
  if (!s) throw new Error("APP_SESSION_SECRET (or ACCESS_CODE_SECRET) is not set in environment variables.");
  return s;
}

async function hmacKey(): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret());
  return crypto.subtle.importKey("raw", keyData, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function bytesToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) return new Uint8Array(0);
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

export type AppSession = { profileId: string; role: string };

export async function signAppSession(profileId: string, role: string): Promise<{ cookieValue: string; maxAge: number }> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${profileId}.${role}.${expiresAt}`;
  const key = await hmacKey();
  const sig = bytesToHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return { cookieValue: `${payload}.${sig}`, maxAge: MAX_AGE_SECONDS };
}

export async function verifyAppSession(cookieValue: string | undefined): Promise<AppSession | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 4) return null;
  const [profileId, role, expiresAtStr, sigHex] = parts;
  const payload = `${profileId}.${role}.${expiresAtStr}`;

  const key = await hmacKey();
  // crypto.subtle.verify is constant-time internally.
  const valid = await crypto.subtle.verify("HMAC", key, hexToBytes(sigHex), new TextEncoder().encode(payload));
  if (!valid) return null;
  if (Date.now() > Number(expiresAtStr)) return null;
  return { profileId, role };
}
