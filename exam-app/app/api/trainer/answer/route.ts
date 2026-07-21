import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * POST /api/trainer/answer  body: { sessionId, questionNumber, selected }
 * ---------------------------------------------------------------------
 * Grades the answer SERVER-SIDE, saves it (progress persists after every
 * answer), updates the session score, and returns the full feedback:
 * correct/wrong, the correct answer, explanation, written sources, and a
 * YouTube search link for videos. Idempotent: answering the same
 * question twice returns the stored feedback without changing the score.
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  const questionNumber = Number(body.questionNumber);
  const selected = String(body.selected || "").toUpperCase();
  if (!sessionId || !Number.isInteger(questionNumber) || !["A", "B", "C", "D"].includes(selected)) {
    return NextResponse.json({ error: "sessionId, questionNumber and selected (A–D) are required." }, { status: 400 });
  }

  const supabase = supabaseAdmin();
  const { data: session } = await supabase
    .from("trainer_sessions")
    .select("id, profile_id, correct_count, wrong_count, status, category, difficulty")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.profile_id !== profile.id) {
    return NextResponse.json({ error: "Not your session." }, { status: 403 });
  }

  const { data: q } = await supabase
    .from("trainer_questions")
    .select("*")
    .eq("session_id", sessionId)
    .eq("question_number", questionNumber)
    .maybeSingle();
  if (!q) return NextResponse.json({ error: "Question not found." }, { status: 404 });

  const correctText = { A: q.answer_a, B: q.answer_b, C: q.answer_c, D: q.answer_d }[
    q.correct_answer as "A" | "B" | "C" | "D"
  ];
  // Structured sources (v4.14). Fall back to the legacy text column for
  // questions generated before the upgrade (those have titles, no URLs).
  const sourcesOut: { title: string; url: string | null }[] = Array.isArray(q.sources_json)
    ? q.sources_json
    : (q.sources || "")
        .split("\n")
        .filter(Boolean)
        .map((line: string) => ({ title: line, url: null }));
  const videoSourcesOut: any[] = Array.isArray(q.video_sources) ? q.video_sources : [];
  const videoLink = q.video_search
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(q.video_search)}`
    : null;

  // Already answered → return stored result, don't re-score.
  if (q.selected_answer) {
    return NextResponse.json({
      alreadyAnswered: true,
      correct: q.is_correct,
      selected: q.selected_answer,
      correct_answer: q.correct_answer,
      correct_text: correctText,
      explanation: q.explanation,
      sources: sourcesOut,
      video_sources: videoSourcesOut,
      video_link: videoLink,
      category: q.category || session.category,
      subcategory: q.subcategory || null,
      difficulty: q.difficulty || session.difficulty,
      score: { correct: session.correct_count, wrong: session.wrong_count },
    });
  }

  const isCorrect = selected === q.correct_answer;

  const { error: qErr } = await supabase
    .from("trainer_questions")
    .update({ selected_answer: selected, is_correct: isCorrect })
    .eq("session_id", sessionId)
    .eq("question_number", questionNumber);
  if (qErr) {
    console.error("[trainer/answer] save failed:", qErr);
    return NextResponse.json({ error: qErr.message }, { status: 500 });
  }

  const newCorrect = session.correct_count + (isCorrect ? 1 : 0);
  const newWrong = session.wrong_count + (isCorrect ? 0 : 1);
  await supabase
    .from("trainer_sessions")
    .update({ correct_count: newCorrect, wrong_count: newWrong, updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  return NextResponse.json({
    correct: isCorrect,
    selected,
    correct_answer: q.correct_answer,
    correct_text: correctText,
    explanation: q.explanation,
    sources: sourcesOut,
    video_sources: videoSourcesOut,
    video_link: videoLink,
    category: q.category || session.category,
    subcategory: q.subcategory || null,
    difficulty: q.difficulty || session.difficulty,
    score: { correct: newCorrect, wrong: newWrong },
  });
}
