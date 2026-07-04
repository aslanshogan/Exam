import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signAppSession, APP_SESSION_COOKIE } from "@/lib/appSession";

/**
 * POST /api/auth/first-admin
 * body: { full_name: string, username: string }
 * ---------------------------------------------------------------------
 * The one-time escape from the chicken-and-egg problem: creating the
 * very FIRST Super Admin, from the website, with no SQL. It is only
 * usable while NO active Super Admin with a username exists — the
 * instant one does, this endpoint returns 403 forever. That means a
 * freshly deployed app has an open setup window until the owner claims
 * it, so: deploy, then IMMEDIATELY create your admin. (Documented in
 * SETUP.md.) On success it also logs the new admin straight in.
 */
async function setupStillOpen(): Promise<boolean> {
  const supabase = supabaseAdmin();
  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", "super_admin")
    .eq("is_active", true)
    .not("username", "is", null);
  return (count ?? 0) === 0;
}

export async function POST(req: NextRequest) {
  if (!(await setupStillOpen())) {
    return NextResponse.json(
      { error: "Setup is already complete — a Super Admin exists. Log in normally, or ask an existing admin to add you." },
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
      return NextResponse.json({ error: "That username is already taken." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("exam_access").insert({ user_id: profile.id, allowed_to_take: true }).select();

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
