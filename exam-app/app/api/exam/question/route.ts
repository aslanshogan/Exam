import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentProfile } from "@/lib/auth";
import { assertOwnsAttempt } from "@/lib/examEngine";

/**
 * GET /api/exam/question?attempt=...&n=...
 * Returns the question at position `n` (1-based) for the given attempt.
 * Reads ENTIRELY from the exam_attempt_questions snapshot — no join to
 * the live `questions` table — so this keeps working correctly even if
 * the original question has since been edited, deactivated, or deleted.
 */
export async function GET(req: NextRequest) {
  const attemptId = req.nextUrl.searchParams.get("attempt");
  const n = Number(req.nextUrl.searchParams.get("n") || "1");
  if (!attemptId) return NextResponse.json({ error: "attempt is required" }, { status: 400 });

  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!(await assertOwnsAttempt(profile.id, attemptId))) {
    return NextResponse.json({ error: "Not your exam attempt." }, { status: 403 });
  }

  const supabase = supabaseAdmin();

  const { data: eaq, error: eaqErr } = await supabase
    .from("exam_attempt_questions")
    .select("question_number, question_id, category_name, question_text, answer_a, answer_b, answer_c, answer_d")
    .eq("attempt_id", attemptId)
    .eq("question_number", n)
    .single();
  if (eaqErr || !eaq) {
    return NextResponse.json({ error: "Question not found." }, { status: 404 });
  }

  const { data: ans } = await supabase
    .from("exam_answers")
    .select("selected_answer")
    .eq("attempt_id", attemptId)
    .eq("question_number", n)
    .maybeSingle();

  const { count: total } = await supabase
    .from("exam_attempt_questions")
    .select("*", { count: "exact", head: true })
    .eq("attempt_id", attemptId);

  return NextResponse.json({
    question_number: eaq.question_number,
    total_questions: total ?? 50,
    question_id: eaq.question_id,
    category_name: eaq.category_name,
    question_text: eaq.question_text,
    answer_a: eaq.answer_a,
    answer_b: eaq.answer_b,
    answer_c: eaq.answer_c,
    answer_d: eaq.answer_d,
    selected_answer: ans?.selected_answer ?? null,
  });
}
