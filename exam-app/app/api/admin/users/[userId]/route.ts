import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission, canManageUsers } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requirePermission(req, canManageUsers);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", params.userId).single();
  if (error || !profile) return NextResponse.json({ error: "User not found." }, { status: 404 });

  const { data: access } = await supabase.from("exam_access").select("*").eq("user_id", params.userId).maybeSingle();
  const { data: theme } = await supabase.from("user_theme_settings").select("*").eq("user_id", params.userId).maybeSingle();
  const { data: attempts } = await supabase
    .from("exam_attempts")
    .select("id, started_at, ended_at, score_percent, pass_fail, status")
    .eq("profile_id", params.userId)
    .order("started_at", { ascending: false });

  return NextResponse.json({ profile, exam_access: access, theme, attempts: attempts || [] });
}

export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requirePermission(req, canManageUsers);
  if (guard.response) return guard.response;

  const body = await req.json();
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase.from("profiles").select("*").eq("id", params.userId).single();
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  // ---- Profile fields: display_name, role_id, is_active -------------
  const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.display_name !== undefined) profileUpdate.display_name = body.display_name;
  if (body.role_id !== undefined) profileUpdate.role_id = body.role_id;
  if (body.is_active !== undefined) profileUpdate.is_active = body.is_active;

  const { error: updateErr } = await supabase.from("profiles").update(profileUpdate).eq("id", params.userId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  if (body.role_id !== undefined && body.role_id !== existing.role_id) {
    await logAudit(guard.profile.id, "role_changed", "profile", params.userId, {
      from: existing.role_id,
      to: body.role_id,
    });
  }
  if (body.is_active !== undefined && body.is_active !== existing.is_active) {
    await logAudit(guard.profile.id, body.is_active ? "user_activated" : "user_deactivated", "profile", params.userId);
  }

  // ---- Exam access fields --------------------------------------------
  if (
    body.allowed_to_take !== undefined ||
    body.allow_retake !== undefined ||
    body.max_attempts !== undefined ||
    body.access_code !== undefined
  ) {
    const accessUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.allowed_to_take !== undefined) accessUpdate.allowed_to_take = body.allowed_to_take;
    if (body.allow_retake !== undefined) accessUpdate.allow_retake = body.allow_retake;
    if (body.max_attempts !== undefined) accessUpdate.max_attempts = body.max_attempts;
    if (body.access_code !== undefined) accessUpdate.access_code = body.access_code || null;

    const { error: accessErr } = await supabase
      .from("exam_access")
      .upsert({ user_id: params.userId, ...accessUpdate }, { onConflict: "user_id" });
    if (accessErr) return NextResponse.json({ error: accessErr.message }, { status: 500 });

    await logAudit(guard.profile.id, "exam_access_updated", "profile", params.userId, body);
  }

  // ---- Password reset --------------------------------------------------
  if (body.new_password) {
    if (!existing.auth_user_id) {
      return NextResponse.json({ error: "This user logs in by access code and has no password to reset." }, { status: 400 });
    }
    const { error: pwErr } = await supabase.auth.admin.updateUserById(existing.auth_user_id, { password: body.new_password });
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 });
    await logAudit(guard.profile.id, "password_reset", "profile", params.userId);
  }

  return NextResponse.json({ ok: true });
}

// Permanently delete a user (auth account + profile, cascades to everything else)
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requirePermission(req, canManageUsers);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("profiles").select("auth_user_id").eq("id", params.userId).single();
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (existing.auth_user_id) {
    await supabase.auth.admin.deleteUser(existing.auth_user_id);
  }
  const { error } = await supabase.from("profiles").delete().eq("id", params.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "user_deleted", "profile", params.userId);
  return NextResponse.json({ ok: true });
}
