import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signAppSession, APP_SESSION_COOKIE } from "@/lib/appSession";

/**
 * POST /api/auth/login
 * body: { username: string }
 * ---------------------------------------------------------------------
 * Username-only login. Looks the username up case-insensitively in
 * public.profiles, requires is_active = true, and sets the signed
 * HTTP-only app-session cookie (see lib/appSession.ts). Returns a
 * role-appropriate redirect target.
 *
 * SECURITY NOTE (deliberate design, be aware of it): there is NO
 * password. The username itself is the only credential, so treat
 * usernames — especially admin usernames — like secrets: don't use
 * guessable ones ("admin", a first name) for privileged accounts. The
 * error message is intentionally identical for "username doesn't
 * exist" and "account is blocked", so probing can't distinguish them.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const username = typeof body.username === "string" ? body.username.trim() : "";
  if (!username) {
    return NextResponse.json({ error: "Please enter your username." }, { status: 400 });
  }

  const supabase = supabaseAdmin();

  // ilike treats % and _ as wildcards — reject inputs containing them
  // BEFORE querying, so nobody can log in by pattern-matching someone
  // else's username.
  if (/[%_]/.test(username)) {
    return NextResponse.json({ error: "Invalid username." }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, full_name, role_id, is_active")
    .ilike("username", username)
    .maybeSingle();

  if (!profile || !profile.is_active) {
    // Same message for both cases — don't reveal which.
    return NextResponse.json({ error: "Unknown username, or account is blocked." }, { status: 401 });
  }

  const { cookieValue, maxAge } = await signAppSession(profile.id, profile.role_id);

  await supabase.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", profile.id);

  const redirectTo = profile.role_id === "trainee" ? "/" : "/admin";
  const res = NextResponse.json({ ok: true, redirectTo, displayName: profile.full_name || profile.display_name });
  res.cookies.set(APP_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
  return res;
}
