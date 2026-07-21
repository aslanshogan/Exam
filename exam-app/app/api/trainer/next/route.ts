import { NextRequest, NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateTrainerQuestions, trainerQuestionRow, dedupeQuestions } from "@/lib/aiTrainer";

export const maxDuration = 60;

/**
 * POST /api/trainer/next  body: { sessionId }
 * ---------------------------------------------------------------------
 * Generates the NEXT question for an active session. Called only from
 * the "Next Question" click (or "Continue" when no question is pending)
 * — never automatically — per the only-on-user-action rule.
 * If an unanswered question already exists, returns it instead of
 * generating a duplicate (double-click / refresh safe).
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
  if (!sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });

  const supabase = supabaseAdmin();
  const { data: session } = await supabase
    .from("trainer_sessions")
    .select("id, profile_id, category, difficulty, status")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.profile_id !== profile.id) {
    return NextResponse.json({ error: "Not your session." }, { status: 403 });
  }
  if (session.status !== "active") {
    return NextResponse.json({ error: "This session has ended. Start a new one." }, { status: 409 });
  }

  // Idempotency: if an unanswered question is already waiting, serve it.
  const { data: pending } = await supabase
    .from("trainer_questions")
    .select("question_number, question_text, answer_a, answer_b, answer_c, answer_d")
    .eq("session_id", sessionId)
    .is("selected_answer", null)
    .order("question_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (pending) return NextResponse.json({ question: pending });

  // Avoid repeating within this session. Use the last 15 as the model's
  // steer, but keep ALL session texts to hard-check the result against.
  const { data: recent } = await supabase
    .from("trainer_questions")
    .select("question_number, question_text")
    .eq("session_id", sessionId)
    .order("question_number", { ascending: false });
  const allTexts = (recent || []).map((r) => r.question_text);
  const avoid = allTexts.slice(0, 15);
  const nextNumber = recent && recent.length > 0 ? recent[0].question_number + 1 : 1;

  // Generate, and if the result duplicates something already asked this
  // session, try once more before giving up (bounded — never a loop).
  let q = null as null | Awaited<ReturnType<typeof generateTrainerQuestions>>["questions"][number];
  for (let attempt = 0; attempt < 2 && !q; attempt++) {
    const gen = await generateTrainerQuestions({
      category: session.category,
      difficulty: session.difficulty,
      count: 1,
      avoid,
    });
    if (gen.error || gen.questions.length === 0) {
      if (attempt === 1) return NextResponse.json({ error: gen.error || "Could not generate a question." }, { status: 502 });
      continue;
    }
    const { kept } = dedupeQuestions(gen.questions, allTexts);
    if (kept.length > 0) q = kept[0];
  }
  if (!q) {
    return NextResponse.json({ error: "Could not produce a new (non-duplicate) question. Please tap Next again." }, { status: 502 });
  }

  const { error: insErr } = await supabase
    .from("trainer_questions")
    .insert(trainerQuestionRow(sessionId, nextNumber, session.category, q));
  if (insErr) {
    console.error("[trainer/next] insert failed:", insErr);
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({
    question: {
      question_number: nextNumber,
      question_text: q.question_text,
      answer_a: q.answer_a,
      answer_b: q.answer_b,
      answer_c: q.answer_c,
      answer_d: q.answer_d,
    },
  });
}
