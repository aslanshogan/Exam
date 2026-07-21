import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signAppSession, APP_SESSION_COOKIE } from "@/lib/appSession";

/**
 * POST /api/auth/first-admin
 * body: { full_name: string, username: string }
 * ---------------------------------------------------------------------
 * One-time creation of the very FIRST Super Admin, from the website,
 * with no SQL. Usable only while NO active Super Admin with a username
 * exists; the instant one does, this returns 403 forever.
 *
 * Fails CLOSED: if the "is setup still open?" check errors, we refuse
 * (rather than risk letting a second admin be created), and if the
 * username is already taken we say so explicitly and point the user at
 * normal Sign In.
 */
async function setupStillOpen(): Promise<{ open: boolean; error: boolean }> {
  const supabase = supabaseAdmin();
  const { count, error } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .eq("is_active", true)
    .not("username", "is", null);
  if (error) {
    console.error("[first-admin] Supabase error checking setup state:", error);
    return { open: false, error: true };
  }
  return { open: (count ?? 1) === 0, error: false };
}

export async function POST(req: NextRequest) {
  const state = await setupStillOpen();
  if (state.error) {
    return NextResponse.json(
      { error: "Could not verify setup state right now. Please try again in a moment." },
      { status: 503 }
    );
  }
  if (!state.open) {
    return NextResponse.json(
      { error: "Setup is already complete. Use normal Sign In." },
      { status: 403 }
    );
  }

  const body = await req.json().catch(() => ({}));
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";

  if (!fullName || !username) {
    return NextResponse.json({ error: "Both full name and username are required." }, { status: 400 });
  }
  if (username.length < 3 || /[%_\s]/.test(username)) {
    return NextResponse.json({ error: "Username must be at least 3 characters, with no spaces." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .insert({
      display_name: fullName,
      full_name: fullName,
      username,
      role_id: "super_admin",
      is_active: true,
    })
    .select("id, role_id")
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      return NextResponse.json(
        { error: "That username already exists. Use normal Sign In, or choose a different username." },
        { status: 409 }
      );
    }
    console.error("[first-admin] insert failed:", error);
    return NextResponse.json({ error: `Could not create admin: ${error.message}` }, { status: 500 });
  }

  const { error: accessErr } = await supabase
    .from("exam_access")
    .insert({ user_id: profile.id, allowed_to_take: true });
  if (accessErr) console.error("[first-admin] exam_access insert failed (non-fatal):", accessErr);

  const { cookieValue, maxAge } = await signAppSession(profile.id, profile.role_id);
  const res = NextResponse.json({ ok: true, redirectTo: "/admin" });
  res.cookies.set(APP_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/",
  });
  return res;
}
