import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageUsers } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, canManageUsers);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, role_id, is_active, last_login_at, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Attach exam access + completed-exam count per user
  const { data: accessRows } = await supabase.from("exam_access").select("*");
  const accessByUser = new Map((accessRows || []).map((a) => [a.user_id, a]));

  const { data: attemptCounts } = await supabase
    .from("exam_attempts")
    .select("profile_id, status");
  const completedByUser = new Map<string, number>();
  for (const a of attemptCounts || []) {
    if (a.status === "completed" && a.profile_id) {
      completedByUser.set(a.profile_id, (completedByUser.get(a.profile_id) || 0) + 1);
    }
  }

  const users = (profiles || []).map((p) => ({
    ...p,
    exam_access: accessByUser.get(p.id) || null,
    completed_exams: completedByUser.get(p.id) || 0,
  }));

  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageUsers);
  if (guard.response) return guard.response;

  const body = await req.json();
  const { email, password, display_name, role_id, allowed_to_take, allow_retake, max_attempts, access_code } = body;

  if (!display_name) {
    return NextResponse.json({ error: "display_name is required." }, { status: 400 });
  }
  if (!email && !access_code) {
    return NextResponse.json({ error: "Provide either an email+password account or an access code." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  let authUserId: string | null = null;

  if (email) {
    if (!password) return NextResponse.json({ error: "password is required when creating an email account." }, { status: 400 });
    const { data: authUser, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (authErr || !authUser?.user) {
      return NextResponse.json({ error: authErr?.message || "Could not create login." }, { status: 500 });
    }
    authUserId = authUser.user.id;
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .insert({
      auth_user_id: authUserId,
      email: email || null,
      display_name,
      role_id: role_id || "trainee",
      is_active: true,
    })
    .select()
    .single();
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  await supabase.from("exam_access").insert({
    user_id: profile.id,
    allowed_to_take: allowed_to_take ?? true,
    allow_retake: allow_retake ?? false,
    max_attempts: max_attempts ?? 1,
    access_code: access_code || null,
  });

  await logAudit(guard.profile.id, "user_created", "profile", profile.id, { display_name, role_id });

  return NextResponse.json({ user: profile });
}
