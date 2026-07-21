import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

export async function GET(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requirePermission(req, isSuperAdmin);
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

/**
 * Guard shared by deactivation paths: never allow blocking/deleting
 * (a) your own account — you'd lock yourself out mid-session — or
 * (b) the LAST active Super Admin — nobody would be left who can
 *     manage users at all, permanently bricking the admin area.
 */
async function assertSafeToDisable(
  actorId: string,
  targetId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (actorId === targetId) {
    return { ok: false, error: "You can't block or delete your own account while logged into it. Ask another Super Admin." };
  }
  const supabase = supabaseAdmin();
  const { data: target } = await supabase.from("profiles").select("role_id, is_active").eq("id", targetId).single();
  if (target?.role_id === "super_admin" && target.is_active) {
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role_id", "super_admin")
      .eq("is_active", true);
    if ((count ?? 0) <= 1) {
      return { ok: false, error: "This is the last active Super Admin — blocking or deleting it would lock everyone out of user management. Create another Super Admin first." };
    }
  }
  return { ok: true };
}

async function applyUpdate(req: NextRequest, params: { userId: string }) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return { response: guard.response };

  const body = await req.json();
  const supabase = supabaseAdmin();

  const { data: existing } = await supabase.from("profiles").select("*").eq("id", params.userId).single();
  if (!existing) return { response: NextResponse.json({ error: "User not found." }, { status: 404 }) };

  // Blocking (is_active -> false) goes through the safety guard.
  if (body.is_active === false && existing.is_active !== false) {
    const safe = await assertSafeToDisable(guard.profile.id, params.userId);
    if (!safe.ok) return { response: NextResponse.json({ error: safe.error }, { status: 400 }) };
  }

  // ---- Profile fields ------------------------------------------------
  const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.full_name !== undefined) {
    const fn = String(body.full_name).trim();
    if (!fn) return { response: NextResponse.json({ error: "full_name can't be empty." }, { status: 400 }) };
    profileUpdate.full_name = fn;
    profileUpdate.display_name = fn; // kept in sync — exam snapshots use display_name
  }
  if (body.username !== undefined) {
    const un = String(body.username).trim();
    if (un.length < 3 || /[%_\s]/.test(un)) {
      return { response: NextResponse.json({ error: "Username must be at least 3 characters, with no spaces." }, { status: 400 }) };
    }
    profileUpdate.username = un;
  }
  if (body.role_id !== undefined) {
    if (!["super_admin", "question_manager", "exam_reviewer", "trainee"].includes(body.role_id)) {
      return { response: NextResponse.json({ error: "Invalid role." }, { status: 400 }) };
    }
    // Demoting the last active Super Admin is the same lockout as blocking them.
    if (existing.role_id === "super_admin" && body.role_id !== "super_admin") {
      const safe = await assertSafeToDisable(guard.profile.id, params.userId);
      if (!safe.ok) return { response: NextResponse.json({ error: safe.error }, { status: 400 }) };
    }
    profileUpdate.role_id = body.role_id;
  }
  if (body.is_active !== undefined) profileUpdate.is_active = body.is_active;
  if (body.email !== undefined) profileUpdate.email = body.email?.trim() || null;

  const { error: updateErr } = await supabase.from("profiles").update(profileUpdate).eq("id", params.userId);
  if (updateErr) {
    if ((updateErr as any).code === "23505") {
      return { response: NextResponse.json({ error: "That username is already taken (usernames are case-insensitive)." }, { status: 409 }) };
    }
    return { response: NextResponse.json({ error: updateErr.message }, { status: 500 }) };
  }

  if (body.role_id !== undefined && body.role_id !== existing.role_id) {
    await logAudit(guard.profile.id, "role_changed", "profile", params.userId, { from: existing.role_id, to: body.role_id });
  }
  if (body.is_active !== undefined && body.is_active !== existing.is_active) {
    await logAudit(guard.profile.id, body.is_active ? "user_activated" : "user_blocked", "profile", params.userId);
  }
  if (body.username !== undefined && body.username !== existing.username) {
    await logAudit(guard.profile.id, "username_changed", "profile", params.userId, { from: existing.username, to: body.username });
  }

  // ---- Exam access fields ---------------------------------------------
  if (body.allowed_to_take !== undefined || body.allow_retake !== undefined || body.max_attempts !== undefined) {
    const accessUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.allowed_to_take !== undefined) accessUpdate.allowed_to_take = body.allowed_to_take;
    if (body.allow_retake !== undefined) accessUpdate.allow_retake = body.allow_retake;
    if (body.max_attempts !== undefined) accessUpdate.max_attempts = body.max_attempts;

    const { error: accessErr } = await supabase
      .from("exam_access")
      .upsert({ user_id: params.userId, ...accessUpdate }, { onConflict: "user_id" });
    if (accessErr) return { response: NextResponse.json({ error: accessErr.message }, { status: 500 }) };

    await logAudit(guard.profile.id, "exam_access_updated", "profile", params.userId, body);
  }

  return { response: NextResponse.json({ ok: true }) };
}

/** PATCH — partial update: full_name, username, role_id, is_active, email, exam-access fields. */
export async function PATCH(req: NextRequest, { params }: { params: { userId: string } }) {
  const result = await applyUpdate(req, params);
  return result.response;
}

/** PUT — kept as an alias of PATCH for backward compatibility with the user detail page. */
export async function PUT(req: NextRequest, { params }: { params: { userId: string } }) {
  const result = await applyUpdate(req, params);
  return result.response;
}

/**
 * DELETE — SOFT delete by default (sets is_active = false; login is
 * blocked, all data kept, fully reversible via Activate). Pass
 * ?hard=true for a PERMANENT delete of the profile (exam attempts are
 * preserved under the person's name — see the snapshot architecture in
 * supabase/schema.sql). Both paths refuse to act on your own account
 * or the last active Super Admin.
 */
export async function DELETE(req: NextRequest, { params }: { params: { userId: string } }) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const hard = req.nextUrl.searchParams.get("hard") === "true";

  const safe = await assertSafeToDisable(guard.profile.id, params.userId);
  if (!safe.ok) return NextResponse.json({ error: safe.error }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: existing } = await supabase.from("profiles").select("auth_user_id, full_name, display_name").eq("id", params.userId).single();
  if (!existing) return NextResponse.json({ error: "User not found." }, { status: 404 });

  if (!hard) {
    const { error } = await supabase
      .from("profiles")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", params.userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await logAudit(guard.profile.id, "user_soft_deleted", "profile", params.userId, {
      name: existing.full_name || existing.display_name,
    });
    return NextResponse.json({ ok: true, soft: true });
  }

  // Hard delete: remove the legacy Supabase Auth account too, if one exists.
  if (existing.auth_user_id) {
    await supabase.auth.admin.deleteUser(existing.auth_user_id);
  }
  const { error } = await supabase.from("profiles").delete().eq("id", params.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "user_deleted", "profile", params.userId, {
    name: existing.full_name || existing.display_name,
  });
  return NextResponse.json({ ok: true, soft: false });
}
