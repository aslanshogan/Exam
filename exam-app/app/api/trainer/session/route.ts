import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateTrainerQuestions, trainerQuestionRow } from "@/lib/aiTrainer";

// Web-search-grounded generation can take 20–60s.
export const maxDuration = 60;

/**
 * GET  /api/trainer/session
 *   → the caller's active session (for "Continue Last Session"), with
 *     score and — if one exists — the current unanswered question.
 *
 * POST /api/trainer/session  body: { category, difficulty }
 *   → ends any previous active session, starts a new one, and generates
 *     the FIRST question immediately (this is the user's explicit
 *     "start" action, so generation here follows the only-on-user-action
 *     rule). Returns the session + first question (never the answer).
 */
export async function GET(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const supabase = supabaseAdmin();
  const { data: session } = await supabase
    .from("trainer_sessions")
    .select("id, category, difficulty, correct_count, wrong_count, created_at")
    .eq("profile_id", profile.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) return NextResponse.json({ exists: false });

  const { data: pending } = await supabase
    .from("trainer_questions")
    .select("question_number, question_text, answer_a, answer_b, answer_c, answer_d")
    .eq("session_id", session.id)
    .is("selected_answer", null)
    .order("question_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return NextResponse.json({ exists: true, session, pendingQuestion: pending || null });
}

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 120) : "";
  const difficulty = ["easy", "medium", "hard", "mixed"].includes(body.difficulty) ? body.difficulty : "medium";
  if (!category) return NextResponse.json({ error: "Choose a category or topic first." }, { status: 400 });

  const supabase = supabaseAdmin();

  // A user has at most one active session; starting a new one ends the old.
  await supabase.from("trainer_sessions").update({ status: "ended" }).eq("profile_id", profile.id).eq("status", "active");

  const { data: session, error: sessErr } = await supabase
    .from("trainer_sessions")
    .insert({ profile_id: profile.id, category, difficulty })
    .select("id, category, difficulty, correct_count, wrong_count")
    .single();
  if (sessErr || !session) {
    console.error("[trainer/session] create failed:", sessErr);
    return NextResponse.json({ error: sessErr?.message || "Could not start a session." }, { status: 500 });
  }

  const gen = await generateTrainerQuestions({ category, difficulty, count: 1 });
  if (gen.error || gen.questions.length === 0) {
    return NextResponse.json({ error: gen.error || "Could not generate a question." }, { status: 502 });
  }
  const q = gen.questions[0];

  const { error: insErr } = await supabase
    .from("trainer_questions")
    .insert(trainerQuestionRow(session.id, 1, category, q));
  if (insErr) {
    console.error("[trainer/session] question insert failed:", insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    session,
    question: {
      question_number: 1,
      question_text: q.question_text,
      answer_a: q.answer_a,
      answer_b: q.answer_b,
      answer_c: q.answer_c,
      answer_d: q.answer_d,
    },
  });
}
