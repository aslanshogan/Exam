import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

// User management is Super Admin only under username login — usernames
// ARE the credential, so whoever can create/edit them controls access.
const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, username, full_name, role_id, is_active, last_login_at, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: accessRows } = await supabase.from("exam_access").select("*");
  const accessByUser = new Map((accessRows || []).map((a) => [a.user_id, a]));

  const { data: attemptCounts } = await supabase.from("exam_attempts").select("profile_id, status");
  const completedByUser = new Map<string, number>();
  for (const a of attemptCounts || []) {
    if (a.status === "completed" && a.profile_id) {
      completedByUser.set(a.profile_id, (completedByUser.get(a.profile_id) || 0) + 1);
    }
  }

  const users = (profiles || []).map((p) => ({
    ...p,
    full_name: p.full_name || p.display_name,
    exam_access: accessByUser.get(p.id) || null,
    completed_exams: completedByUser.get(p.id) || 0,
  }));

  return NextResponse.json({ users, currentUserId: guard.profile.id });
}

/**
 * POST /api/admin/users
 * body: { full_name, username, role_id, is_active?, email?,
 *         allowed_to_take?, allow_retake?, max_attempts? }
 * Creates a username-only user. No Supabase Auth account is involved —
 * the username in public.profiles IS the login. Email is optional.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const body = await req.json();
  const fullName = typeof body.full_name === "string" ? body.full_name.trim() : "";
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const roleId = body.role_id || "trainee";

  if (!fullName) return NextResponse.json({ error: "full_name is required." }, { status: 400 });
  if (!username) return NextResponse.json({ error: "username is required." }, { status: 400 });
  if (username.length < 3 || /[%_\s]/.test(username)) {
    return NextResponse.json({ error: "Username must be at least 3 characters, with no spaces." }, { status: 400 });
  }
  if (!["super_admin", "question_manager", "exam_reviewer", "trainee"].includes(roleId)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: profile, error } = await supabase
    .from("profiles")
    .insert({
      display_name: fullName,
      full_name: fullName,
      username,
      email: body.email?.trim() || null,
      role_id: roleId,
      is_active: body.is_active ?? true,
    })
    .select()
    .single();

  if (error) {
    if ((error as any).code === "23505") {
      return NextResponse.json({ error: "That username is already taken (usernames are case-insensitive)." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("exam_access").insert({
    user_id: profile.id,
    allowed_to_take: body.allowed_to_take ?? true,
    allow_retake: body.allow_retake ?? false,
    max_attempts: body.max_attempts ?? 1,
  });

  await logAudit(guard.profile.id, "user_created", "profile", profile.id, { full_name: fullName, username, role_id: roleId });

  return NextResponse.json({ user: profile });
}
