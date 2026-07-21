import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";
import { loadExamSettings, getQuestionPoolStats } from "@/lib/examEngine";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const [settings, stats] = await Promise.all([loadExamSettings(), getQuestionPoolStats()]);
  return NextResponse.json({ settings, stats });
}

const FIELDS = [
  "total_questions",
  "pass_score",
  "default_questions_per_category",
  "selection_mode",
  "randomize_question_order",
  "include_always_questions",
  "allow_retake",
  "show_result_to_trainee",
  "show_correct_answers_to_trainee",
];

export async function PUT(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const body = await req.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const f of FIELDS) {
    if (body[f] !== undefined) update[f] = body[f];
  }

  const supabase = supabaseAdmin();
  const { data, error } = await supabase.from("exam_settings").update(update).eq("id", 1).select().single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "exam_settings_changed", "exam_settings", "1", body);

  const stats = await getQuestionPoolStats();
  return NextResponse.json({ settings: data, stats });
}
