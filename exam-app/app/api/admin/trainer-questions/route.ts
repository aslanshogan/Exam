import { NextRequest, NextResponse } from "next/server";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/admin/trainer-questions
 * Admin view of the AI Knowledge Trainer's generated questions. Returns
 * recent sessions with their questions (and who practiced), so admins can
 * see what the trainer produced without opening the database.
 * Optional: ?sessionId=... to fetch one session's questions.
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const supabase = supabaseAdmin();
  const one = req.nextUrl.searchParams.get("sessionId");

  // Pull recent sessions (cap for safety), newest first.
  const { data: sessions, error } = await supabase
    .from("trainer_sessions")
    .select("id, profile_id, category, difficulty, correct_count, wrong_count, status, created_at")
    .order("created_at", { ascending: false })
    .limit(one ? 1 : 100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const sessionList = one ? (sessions || []).filter((s) => s.id === one) : (sessions || []);
  const sessionIds = sessionList.map((s) => s.id);

  // Map profile_id → display name.
  const profileIds = Array.from(new Set(sessionList.map((s) => s.profile_id)));
  const nameMap = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, username").in("id", profileIds);
    for (const p of profs || []) nameMap.set(p.id, p.display_name || p.username || "user");
  }

  // Question counts per session (and full questions when a single session
  // is requested).
  let questionsBySession = new Map<string, any[]>();
  const countMap = new Map<string, number>();
  if (sessionIds.length > 0) {
    if (one) {
      const { data: qs } = await supabase
        .from("trainer_questions")
        .select("question_number, question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, explanation, selected_answer, is_correct, sources_json, sources, video_sources, subcategory, difficulty")
        .eq("session_id", one)
        .order("question_number", { ascending: true });
      questionsBySession.set(one, qs || []);
      countMap.set(one, (qs || []).length);
    } else {
      const { data: qrows } = await supabase
        .from("trainer_questions")
        .select("session_id")
        .in("session_id", sessionIds);
      for (const r of qrows || []) countMap.set(r.session_id, (countMap.get(r.session_id) || 0) + 1);
    }
  }

  const out = sessionList.map((s) => ({
    id: s.id,
    user: nameMap.get(s.profile_id) || "user",
    category: s.category,
    difficulty: s.difficulty,
    correct: s.correct_count,
    wrong: s.wrong_count,
    status: s.status,
    created_at: s.created_at,
    questionCount: countMap.get(s.id) || 0,
    questions: one
      ? (questionsBySession.get(s.id) || []).map((q) => ({
          question_number: q.question_number,
          question_text: q.question_text,
          answers: { A: q.answer_a, B: q.answer_b, C: q.answer_c, D: q.answer_d },
          correct_answer: q.correct_answer,
          selected_answer: q.selected_answer,
          is_correct: q.is_correct,
          explanation: q.explanation,
          sources: Array.isArray(q.sources_json) ? q.sources_json : (q.sources || "").split("\n").filter(Boolean).map((l: string) => ({ title: l, url: null })),
          video_sources: Array.isArray(q.video_sources) ? q.video_sources : [],
          subcategory: q.subcategory,
          difficulty: q.difficulty,
        }))
      : undefined,
  }));

  return NextResponse.json({ sessions: out });
}
