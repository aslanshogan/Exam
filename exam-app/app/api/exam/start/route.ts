import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentProfile } from "@/lib/auth";
import { loadExamSettings, buildExamAttemptQuestions } from "@/lib/examEngine";

export async function POST(req: NextRequest) {
  const profile = await getCurrentProfile(req);
  if (!profile) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });
  if (!profile.is_active) return NextResponse.json({ error: "Your account is inactive." }, { status: 403 });

  const supabase = supabaseAdmin();
  const examSettings = await loadExamSettings();

  const { data: access } = await supabase
    .from("exam_access")
    .select("allowed_to_take, allow_retake, max_attempts, attempts_used, assigned_template_id")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (!access || !access.allowed_to_take) {
    return NextResponse.json({ error: "You are not approved to take this exam. Contact your administrator." }, { status: 403 });
  }
  // Retake requires BOTH the global master switch (exam_settings.allow_retake)
  // AND this trainee's own override (exam_access.allow_retake) to be true.
  const retakeAllowed = examSettings.allow_retake && access.allow_retake;
  if (access.attempts_used >= access.max_attempts && !retakeAllowed) {
    return NextResponse.json({ error: "You have already used your exam attempt." }, { status: 403 });
  }

  // If a Super Admin has assigned this trainee a shared exam template
  // ("Same Exam for Multiple Trainees" — /admin/exam-templates), this
  // returns THAT exact question set instead of a fresh random one.
  let rows;
  try {
    rows = await buildExamAttemptQuestions(access.assigned_template_id ?? null);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 422 });
  }

  const { data: attempt, error: attemptErr } = await supabase
    .from("exam_attempts")
    .insert({ profile_id: profile.id, trainee_name: profile.display_name, status: "in_progress" })
    .select("id")
    .single();
  if (attemptErr || !attempt) {
    return NextResponse.json({ error: attemptErr?.message || "Could not create attempt." }, { status: 500 });
  }

  const insertRows = rows.map((r) => ({ ...r, attempt_id: attempt.id }));
  const { error: eaqErr } = await supabase.from("exam_attempt_questions").insert(insertRows);
  if (eaqErr) {
    return NextResponse.json({ error: eaqErr.message }, { status: 500 });
  }

  return NextResponse.json({ attemptId: attempt.id, totalQuestions: insertRows.length });
}
