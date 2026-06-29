import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signCodeSession, CODE_SESSION_COOKIE } from "@/lib/codeSession";

export async function POST(req: NextRequest) {
  const { code } = await req.json();
  if (!code || !code.trim()) {
    return NextResponse.json({ error: "Please enter an access code." }, { status: 400 });
  }

  const admin = supabaseAdmin();
  const { data: access } = await admin
    .from("exam_access")
    .select("user_id, allowed_to_take, profiles(id, display_name, is_active, role_id)")
    .eq("access_code", code.trim())
    .maybeSingle();

  const profile = (access as any)?.profiles;
  if (!access || !profile) {
    return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
  }
  if (!profile.is_active) {
    return NextResponse.json({ error: "This account has been deactivated." }, { status: 403 });
  }

  await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", profile.id);

  const { cookieValue, maxAge } = await signCodeSession(profile.id);
  const res = NextResponse.json({ ok: true, displayName: profile.display_name, redirectTo: "/" });
  res.cookies.set(CODE_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  return res;
}
