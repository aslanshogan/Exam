import { NextRequest, NextResponse } from "next/server";
import { verifyAppSession, APP_SESSION_COOKIE } from "@/lib/appSession";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/debug/session
 * ---------------------------------------------------------------------
 * Diagnostics for "why do buttons say unauthorized?". Reports whether
 * the app_session cookie exists, whether it verifies, and the resolved
 * profile. Accessible in development to anyone; in production ONLY to a
 * verified super_admin (so it can't leak session info publicly).
 */
export async function GET(req: NextRequest) {
  const isDev = process.env.NODE_ENV !== "production";
  const rawCookie = req.cookies.get(APP_SESSION_COOKIE)?.value;
  const cookieExists = !!rawCookie;

  const session = await verifyAppSession(rawCookie);
  const verifies = !!session;

  let profile: any = null;
  if (session) {
    const supabase = supabaseAdmin();
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, display_name, role_id, is_active")
      .eq("id", session.profileId)
      .maybeSingle();
    profile = data;
  }

  // In production, gate behind super_admin.
  if (!isDev && profile?.role_id !== "super_admin") {
    return NextResponse.json({ error: "Not available." }, { status: 403 });
  }

  return NextResponse.json({
    environment: isDev ? "development" : "production",
    cookieExists,
    verifies,
    sessionRole: session?.role ?? null,
    profile: profile
      ? {
          id: profile.id,
          username: profile.username,
          full_name: profile.full_name || profile.display_name,
          role_id: profile.role_id,
          is_active: profile.is_active,
        }
      : null,
    hint: !cookieExists
      ? "No app_session cookie. You are not logged in (or the cookie didn't reach the server — check you're on the deployed URL, not a preview)."
      : !verifies
      ? "Cookie present but signature invalid or expired. Log out and back in; if it persists, APP_SESSION_SECRET may have changed between build and runtime."
      : !profile
      ? "Session valid but no matching profile row (account deleted?)."
      : !profile.is_active
      ? "Account is blocked (is_active = false)."
      : "Session healthy.",
  });
}
