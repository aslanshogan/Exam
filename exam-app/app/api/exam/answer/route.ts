import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentProfile } from "@/lib/auth";
import { assertOwnsAttempt } from "@/lib/examEngine";

export async function POST(req: NextRequest) {
  const { attemptId, questionNumber, selectedAnswer } = await req.json();
  if (!attemptId || !questionNumber || !selectedAnswer) {
    return NextResponse.json({ error: "attemptId, questionNumber, and selectedAnswer are required." }, { status: 400 });
  }
  if (!["A", "B", "C", "D"].includes(selectedAnswer)) {
    return NextResponse.json({ error: "selectedAnswer must be A, B, C, or D." }, { status: 400 });
  }

  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!(await assertOwnsAttempt(profile.id, attemptId))) {
    return NextResponse.json({ error: "Not your exam attempt." }, { status: 403 });
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase
    .from("exam_answers")
    .upsert(
      { attempt_id: attemptId, question_number: questionNumber, selected_answer: selectedAnswer, answered_at: new Date().toISOString() },
      { onConflict: "attempt_id,question_number" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
