import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/trainer/history?sessionId=...
 * Returns all ANSWERED questions in the session (most recent first) so
 * the user can review what they already did: their answer, the correct
 * answer, explanation, sources, videos, and whether they got it right.
 * If no sessionId is given, uses the caller's active session.
 */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const supabase = supabaseAdmin();
  let sessionId = req.nextUrl.searchParams.get("sessionId") || "";

  // Resolve to the active session if none passed.
  if (!sessionId) {
    const { data: s } = await supabase
      .from("trainer_sessions")
      .select("id")
      .eq("profile_id", profile.id)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    sessionId = s?.id || "";
  }
  if (!sessionId) return NextResponse.json({ items: [], sessionId: "" });

  // Verify ownership.
  const { data: sess } = await supabase
    .from("trainer_sessions")
    .select("id, profile_id, category, difficulty, correct_count, wrong_count")
    .eq("id", sessionId)
    .maybeSingle();
  if (!sess || sess.profile_id !== profile.id) {
    return NextResponse.json({ error: "Not your session." }, { status: 403 });
  }

  const { data: rows } = await supabase
    .from("trainer_questions")
    .select("question_number, question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, explanation, selected_answer, is_correct, sources_json, sources, video_sources, category, subcategory, difficulty")
    .eq("session_id", sessionId)
    .not("selected_answer", "is", null)
    .order("question_number", { ascending: false });

  const items = (rows || []).map((q) => {
    const sourcesOut = Array.isArray(q.sources_json)
      ? q.sources_json
      : (q.sources || "").split("\n").filter(Boolean).map((line: string) => ({ title: line, url: null }));
    return {
      question_number: q.question_number,
      question_text: q.question_text,
      answers: { A: q.answer_a, B: q.answer_b, C: q.answer_c, D: q.answer_d },
      correct_answer: q.correct_answer,
      selected_answer: q.selected_answer,
      is_correct: q.is_correct,
      explanation: q.explanation,
      sources: sourcesOut,
      video_sources: Array.isArray(q.video_sources) ? q.video_sources : [],
      category: q.category,
      subcategory: q.subcategory,
      difficulty: q.difficulty,
    };
  });

  return NextResponse.json({
    sessionId,
    session: { category: sess.category, difficulty: sess.difficulty, correct: sess.correct_count, wrong: sess.wrong_count },
    items,
  });
}
