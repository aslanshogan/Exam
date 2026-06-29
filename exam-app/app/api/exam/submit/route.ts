import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentProfile } from "@/lib/auth";
import { assertOwnsAttempt, loadExamSettings } from "@/lib/examEngine";

export async function POST(req: NextRequest) {
  const { attemptId } = await req.json();
  if (!attemptId) return NextResponse.json({ error: "attemptId is required." }, { status: 400 });

  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!(await assertOwnsAttempt(profile.id, attemptId))) {
    return NextResponse.json({ error: "Not your exam attempt." }, { status: 403 });
  }

  const supabase = supabaseAdmin();

  // Load all questions for this attempt, in order — this IS the
  // snapshot (category, text, options, correct answer, explanation),
  // not a live join to `questions`. Scoring a past exam never depends
  // on the question bank being unchanged.
  const { data: eaqRows, error: eaqErr } = await supabase
    .from("exam_attempt_questions")
    .select("question_number, question_id, category_name, question_text, correct_answer, explanation")
    .eq("attempt_id", attemptId)
    .order("question_number", { ascending: true });
  if (eaqErr || !eaqRows) return NextResponse.json({ error: "Could not load exam questions." }, { status: 500 });

  // Load all saved answers for this attempt, keyed by question_number
  const { data: answerRows } = await supabase
    .from("exam_answers")
    .select("question_number, selected_answer")
    .eq("attempt_id", attemptId);
  const answerMap = new Map((answerRows || []).map((a) => [a.question_number, a.selected_answer]));

  // 1. Block submit until every question is answered
  const unanswered = eaqRows.filter((r) => !answerMap.get(r.question_number));
  if (unanswered.length > 0) {
    return NextResponse.json(
      { error: `${unanswered.length} question(s) still unanswered.`, unansweredCount: unanswered.length },
      { status: 422 }
    );
  }

  // 2. Score directly from the snapshot
  let correctCount = 0;
  let wrongCount = 0;
  const detailedRows = eaqRows.map((r) => {
    const selected = answerMap.get(r.question_number) as "A" | "B" | "C" | "D";
    const isCorrect = r.correct_answer === selected;
    if (isCorrect) correctCount++;
    else wrongCount++;
    return {
      attempt_id: attemptId,
      question_number: r.question_number,
      question_id: r.question_id,
      category_name: r.category_name,
      question_text: r.question_text,
      selected_answer: selected,
      correct_answer: r.correct_answer,
      correct: isCorrect,
      explanation: r.explanation,
    };
  });

  const total = eaqRows.length;
  const scorePercent = total > 0 ? correctCount / total : 0;

  const examSettings = await loadExamSettings();
  const passFail = scorePercent >= examSettings.pass_score ? "PASS" : "FAIL";

  // 3. Save summary to exam_attempts
  const { data: attempt } = await supabase.from("exam_attempts").select("started_at").eq("id", attemptId).single();
  const startedAt = attempt?.started_at ? new Date(attempt.started_at) : new Date();
  const endedAt = new Date();
  const durationSeconds = Math.max(0, Math.round((endedAt.getTime() - startedAt.getTime()) / 1000));

  const { error: updateErr } = await supabase
    .from("exam_attempts")
    .update({
      ended_at: endedAt.toISOString(),
      duration_seconds: durationSeconds,
      score_percent: scorePercent,
      correct_count: correctCount,
      wrong_count: wrongCount,
      pass_fail: passFail,
      status: "completed",
    })
    .eq("id", attemptId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Count this attempt against the trainee's allowance
  const { data: attemptRow } = await supabase.from("exam_attempts").select("profile_id").eq("id", attemptId).single();
  if (attemptRow?.profile_id) {
    await supabase.rpc("increment_attempts_used", { p_user_id: attemptRow.profile_id });
  }

  // 4. "DetailedResults" data is exam_attempt_questions (the snapshot)
  //    joined with exam_answers by question_number — already fully
  //    self-contained, returned directly here so the client never needs
  //    extra joins, and /admin/results/[attemptId] reads it the same way.

  return NextResponse.json({
    attemptId,
    scorePercent,
    correctCount,
    wrongCount,
    passFail,
    total,
    detailed: detailedRows,
  });
}
