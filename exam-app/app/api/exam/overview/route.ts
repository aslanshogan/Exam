import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { assertOwnsAttempt } from "@/lib/examEngine";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/exam/overview?attempt=...
 * ---------------------------------------------------------------------
 * Returns everything the exam navigator needs in one call:
 *  - isPreview: whether this attempt is an admin preview
 *  - total: number of questions
 *  - questions: [{ question_number, answered }] for the jump grid
 *  - (for admin preview / "view all") the full question content so the
 *    admin can read every question at once instead of one by one.
 */
export async function GET(req: NextRequest) {
  const attemptId = req.nextUrl.searchParams.get("attempt");
  if (!attemptId) return NextResponse.json({ error: "attempt is required." }, { status: 400 });

  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  if (!(await assertOwnsAttempt(profile.id, attemptId))) {
    return NextResponse.json({ error: "Not your attempt." }, { status: 403 });
  }

  const supabase = supabaseAdmin();

  // Is this a preview? Tolerate the column not existing on older DBs.
  let isPreview = false;
  {
    const res = await supabase.from("exam_attempts").select("is_preview").eq("id", attemptId).maybeSingle();
    if (!res.error && res.data) isPreview = !!(res.data as any).is_preview;
  }

  const { data: eaqRows, error } = await supabase
    .from("exam_attempt_questions")
    .select("question_number, category_name, question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, explanation")
    .eq("attempt_id", attemptId)
    .order("question_number", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: answerRows } = await supabase
    .from("exam_answers")
    .select("question_number, selected_answer")
    .eq("attempt_id", attemptId);
  const answerMap = new Map((answerRows || []).map((a) => [a.question_number, a.selected_answer]));

  const questions = (eaqRows || []).map((r) => ({
    question_number: r.question_number,
    answered: !!answerMap.get(r.question_number),
    selected_answer: answerMap.get(r.question_number) ?? null,
    // Full content included so admins can view all at once. (For a real
    // trainee this is the same content they'd see anyway as they page
    // through; answers aren't revealed here except correct_answer, which
    // we only include for preview.)
    category_name: r.category_name,
    question_text: r.question_text,
    answer_a: r.answer_a,
    answer_b: r.answer_b,
    answer_c: r.answer_c,
    answer_d: r.answer_d,
    correct_answer: isPreview ? r.correct_answer : undefined,
    explanation: isPreview ? r.explanation : undefined,
  }));

  return NextResponse.json({
    isPreview,
    total: questions.length,
    questions,
  });
}
