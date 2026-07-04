import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

/**
 * Deleting results is intentionally restricted to Super Admin only —
 * no permission-override escape hatch like the other actions in this
 * app. Exam Reviewers can view and export, but never delete; this is
 * the one irreversible action in the results area.
 */
const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

export async function DELETE(req: NextRequest, { params }: { params: { attemptId: string } }) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("id, trainee_name, score_percent, pass_fail")
    .eq("id", params.attemptId)
    .maybeSingle();
  if (!attempt) return NextResponse.json({ error: "Result not found." }, { status: 404 });

  // exam_attempt_questions and exam_answers cascade-delete automatically
  // (foreign keys are ON DELETE CASCADE — see supabase/schema.sql).
  const { error } = await supabase.from("exam_attempts").delete().eq("id", params.attemptId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "result_deleted", "exam_attempt", params.attemptId, {
    trainee_name: attempt.trainee_name,
    score_percent: attempt.score_percent,
    pass_fail: attempt.pass_fail,
  });

  return NextResponse.json({ ok: true });
}
