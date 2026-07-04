import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requirePermission } from "@/lib/auth";
import { logAudit } from "@/lib/auditLog";
import { buildRandomExam, snapshotQuestions } from "@/lib/examEngine";

const isSuperAdmin = async (p: { role_id: string }) => p.role_id === "super_admin";

export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const { data: templates, error } = await supabase
    .from("exam_templates")
    .select("id, name, shuffle_order_per_trainee, created_at")
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Question count + assigned trainee count per template
  const result = await Promise.all(
    (templates || []).map(async (t) => {
      const { count: questionCount } = await supabase
        .from("exam_template_questions")
        .select("*", { count: "exact", head: true })
        .eq("template_id", t.id);
      const { count: assignedCount } = await supabase
        .from("exam_access")
        .select("*", { count: "exact", head: true })
        .eq("assigned_template_id", t.id);
      return { ...t, questionCount: questionCount ?? 0, assignedCount: assignedCount ?? 0 };
    })
  );

  return NextResponse.json({ templates: result });
}

/**
 * POST /api/admin/exam-templates
 * body: { name: string, shuffle_order_per_trainee?: boolean }
 * Generates ONE question set right now using the normal exam-building
 * logic (current exam_settings — always-include questions, selection
 * mode, etc.) and snapshots it permanently as a reusable template. The
 * questions in a template never change after creation, even if the
 * live question bank changes later — same guarantee as a regular exam
 * attempt, see lib/examEngine.ts.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, isSuperAdmin);
  if (guard.response) return guard.response;

  const body = await req.json();
  if (!body.name || !body.name.trim()) {
    return NextResponse.json({ error: "A name for this exam template is required." }, { status: 400 });
  }

  let questionIds: string[];
  try {
    questionIds = await buildRandomExam();
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 422 });
  }

  let snapshots;
  try {
    snapshots = await snapshotQuestions(questionIds);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }

  const supabase = supabaseAdmin();
  const { data: template, error: templateErr } = await supabase
    .from("exam_templates")
    .insert({
      name: body.name.trim(),
      created_by: guard.profile.id,
      shuffle_order_per_trainee: body.shuffle_order_per_trainee ?? false,
    })
    .select("id")
    .single();
  if (templateErr || !template) {
    return NextResponse.json({ error: templateErr?.message || "Could not create template." }, { status: 500 });
  }

  const rows = snapshots.map((snap, idx) => ({
    template_id: template.id,
    question_number: idx + 1,
    question_id: snap.question_id,
    category_name: snap.category_name,
    question_text: snap.question_text,
    answer_a: snap.answer_a,
    answer_b: snap.answer_b,
    answer_c: snap.answer_c,
    answer_d: snap.answer_d,
    correct_answer: snap.correct_answer,
    explanation: snap.explanation,
  }));
  const { error: rowsErr } = await supabase.from("exam_template_questions").insert(rows);
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  await logAudit(guard.profile.id, "exam_template_created", "exam_template", template.id, {
    name: body.name.trim(),
    questionCount: rows.length,
  });

  return NextResponse.json({ templateId: template.id, questionCount: rows.length });
}
