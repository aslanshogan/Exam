import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentProfile } from "@/lib/auth";
import { buildExamAttemptQuestions } from "@/lib/examEngine";

/**
 * POST /api/exam/preview-start
 * ---------------------------------------------------------------------
 * For Super Admin / Question Manager / Exam Reviewer to actually TAKE
 * the exam themselves — e.g. to check the current exam_settings
 * configuration works end to end, or to sanity-check newly imported
 * questions. Trainees use the normal /api/exam/start instead (which
 * enforces exam_access — allowed_to_take, attempt limits, etc; this
 * route deliberately skips all of that since it's not a real trainee
 * attempt). Always uses fresh random generation, never an assigned
 * template — this tests the current CONFIGURATION, not a specific
 * trainee's assignment.
 *
 * This DOES create a real row in exam_attempts/exam_attempt_questions
 * under the admin's own account (trainee_name gets a "(Preview)"
 * suffix so it's obviously distinguishable on the Results pages). If
 * you don't want it cluttering your stats, delete it afterward from
 * the Results page or /admin/data.
 */
export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!profile.is_active) return NextResponse.json({ error: "Your account is inactive." }, { status: 403 });
  if (profile.role_id === "trainee") {
    return NextResponse.json({ error: "Trainees should use the normal Start Exam button on the Home page." }, { status: 400 });
  }

  let rows;
  try {
    rows = await buildExamAttemptQuestions(null);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 422 });
  }

  const supabase = supabaseAdmin();
  const { data: attempt, error: attemptErr } = await supabase
    .from("exam_attempts")
    .insert({ profile_id: profile.id, trainee_name: `${profile.display_name} (Admin Preview)`, status: "in_progress", is_preview: true })
    .select("id")
    .single();
  if (attemptErr || !attempt) {
    return NextResponse.json({ error: attemptErr?.message || "Could not create preview attempt." }, { status: 500 });
  }

  const insertRows = rows.map((r) => ({ ...r, attempt_id: attempt.id }));
  const { error: eaqErr } = await supabase.from("exam_attempt_questions").insert(insertRows);
  if (eaqErr) {
    return NextResponse.json({ error: eaqErr.message }, { status: 500 });
  }

  return NextResponse.json({ attemptId: attempt.id, totalQuestions: insertRows.length });
}
