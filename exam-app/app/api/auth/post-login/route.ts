import { NextRequest, NextResponse } from "next/server";
import { supabaseServerClient } from "@/lib/supabaseServerClient";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  const supabase = supabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData?.user) {
    return NextResponse.json({ error: "No active session." }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select("id, display_name, role_id, is_active")
    .eq("auth_user_id", authData.user.id)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: "No profile found for this account. Contact your administrator." }, { status: 404 });
  }
  if (!profile.is_active) {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "Your account has been deactivated." }, { status: 403 });
  }

  await admin.from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", profile.id);

  const redirectTo = profile.role_id === "trainee" ? "/" : "/admin";
  return NextResponse.json({ role: profile.role_id, displayName: profile.display_name, redirectTo });
}
