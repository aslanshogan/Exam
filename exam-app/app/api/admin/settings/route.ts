import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

/**
 * /api/admin/settings now only manages app_settings.music_globally_enabled
 * (used by /admin/themes). Exam-related settings (passing score, result/
 * answer visibility, total questions, etc.) live in exam_settings —
 * see /api/admin/exam-settings and /admin/exam-settings.
 * app_settings.passing_score / show_explanations_to_trainee are kept in
 * the schema for backward compatibility but are no longer read anywhere.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, async (p) => p.role_id === "super_admin");
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data } = await supabase.from("app_settings").select("*").eq("id", 1).single();
  return NextResponse.json({ settings: data });
}

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, async (p) => p.role_id === "super_admin");
  if (guard.response) return guard.response;

  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (body.music_globally_enabled !== undefined) update.music_globally_enabled = body.music_globally_enabled;

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("app_settings").update(update).eq("id", 1).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "app_settings_changed", "app_settings", "1", body);
  return NextResponse.json({ settings: data });
}
