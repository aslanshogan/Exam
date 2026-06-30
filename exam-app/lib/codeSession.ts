/**
 * codeSession
 * ---------------------------------------------------------------------
 * A minimal signed-cookie session used ONLY for trainees who log in via
 * an access code instead of email+password (see /login and
 * /api/auth/access-code). It is intentionally separate from Supabase
 * Auth — it never grants access to /admin/* routes, only to the exam
 * flow (/exam, /result, and their API routes), and is checked alongside
 * (not instead of) a real Supabase session in middleware.ts.
 *
 * Token format: "<profileId>.<expiresAtMs>.<hmacSignatureHex>"
 *
 * IMPORTANT RUNTIME NOTE: this file is imported by middleware.ts, which
 * runs on Vercel's Edge Runtime — NOT Node.js. Edge Runtime does not
 * have Node's built-in `crypto` module (createHmac, timingSafeEqual) or
 * `Buffer`. This file therefore uses only the Web Crypto API
 * (`crypto.subtle`), which is available natively in BOTH the Edge
 * Runtime and Node.js 18+, so the exact same code works everywhere this
 * is imported from (middleware, API routes, Server Components). Do not
 * reintroduce `require("crypto")` / `Buffer` here.
 */
const COOKIE_NAME = "trainee_code_session";
const MAX_AGE_SECONDS = 60 * 60 * 8; // 8 hours

function secret(): string {
  const s = process.env.ACCESS_CODE_SECRET;
  if (!s) throw new Error("ACCESS_CODE_SECRET is not set in environment variables.");
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
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export async function signCodeSession(profileId: string): Promise<{ cookieValue: string; maxAge: number }> {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = `${profileId}.${expiresAt}`;
  const key = await hmacKey();
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sig = bytesToHex(sigBuffer);
  return { cookieValue: `${payload}.${sig}`, maxAge: MAX_AGE_SECONDS };
}

export async function verifyCodeSession(cookieValue: string | undefined): Promise<string | null> {
  if (!cookieValue) return null;
  const parts = cookieValue.split(".");
  if (parts.length !== 3) return null;
  const [profileId, expiresAtStr, sigHex] = parts;
  const payload = `${profileId}.${expiresAtStr}`;

  const key = await hmacKey();
  // crypto.subtle.verify does a constant-time comparison internally —
  // no need for a manual timing-safe-equal helper.
  const valid = await crypto.subtle.verify("HMAC", key, hexToBytes(sigHex), new TextEncoder().encode(payload));
  if (!valid) return null;

  if (Date.now() > Number(expiresAtStr)) return null;
  return profileId;
}

export const CODE_SESSION_COOKIE = COOKIE_NAME;
