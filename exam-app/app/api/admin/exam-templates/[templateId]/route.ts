import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

/**
 * GET /api/admin/exam-templates/[templateId]
 * Returns the template's name plus its full snapshotted question list
 * (in order), so an admin can review exactly what a shared exam
 * contains, including the correct answers.
 */
export async function GET(req: NextRequest, { params }: { params: { templateId: string } }) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data: template } = await supabase
    .from("exam_templates")
    .select("id, name, shuffle_order_per_trainee, created_at")
    .eq("id", params.templateId)
    .maybeSingle();
  if (!template) return NextResponse.json({ error: "Template not found." }, { status: 404 });

  const { data: questions, error } = await supabase
    .from("exam_template_questions")
    .select("question_number, category_name, question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, explanation")
    .eq("template_id", params.templateId)
    .order("question_number", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ template, questions: questions || [] });
}

export async function DELETE(req: NextRequest, { params }: { params: { templateId: string } }) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  // Any trainee currently assigned this template falls back to normal
  // random generation automatically (assigned_template_id -> SET NULL
  // via the FK), they are not left broken.
  const { error } = await supabase.from("exam_templates").delete().eq("id", params.templateId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(guard.profile.id, "exam_template_deleted", "exam_template", params.templateId);
  return NextResponse.json({ ok: true });
}
