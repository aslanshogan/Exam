import { redirect } from "next/navigation";
import Header from "@/components/Header";
import ThemeProvider from "@/components/ThemeProvider";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerSideProfile, getThemeForUser } from "@/lib/themeServer";
import { loadExamSettings } from "@/lib/examEngine";
import clsx from "clsx";

export default async function ResultPage({ params }: { params: { attemptId: string } }) {
  const profile = await getServerSideProfile();
  if (!profile) redirect(`/login?next=/result/${params.attemptId}`);

  const supabase = supabaseAdmin();
  const { data: attempt } = await supabase
    .from("exam_attempts")
    .select("*")
    .eq("id", params.attemptId)
    .single();

  // Trainees may only view their OWN result; admin-type roles can view any.
  const isOwner = attempt?.profile_id === profile.id;
  const canViewAny = profile.role_id === "super_admin" || profile.role_id === "exam_reviewer";
  if (!attempt || (!isOwner && !canViewAny)) {
    redirect("/");
  }

  const examSettings = await loadExamSettings();
  const theme = await getThemeForUser(profile.id);

  // Trainees can be configured to not see their score at all — admins/
  // reviewers always see the full result regardless of this setting.
  if (isOwner && !canViewAny && !examSettings.show_result_to_trainee) {
    return (
      <ThemeProvider initialTheme={theme}>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 max-w-xl mx-auto px-4 sm:px-6 py-12 w-full">
            <div className="rounded-2xl shadow-card p-8 text-center" style={{ backgroundColor: "var(--card-color)" }}>
              <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-color)" }}>Exam Submitted</h1>
              <p className="text-gray-500 mb-6">
                Your answers have been recorded. Your administrator will share your results with you.
              </p>
              <a
                href="/"
                style={{ backgroundColor: "var(--button-color)" }}
                className="inline-block px-6 py-3 rounded-lg font-semibold text-navy-900 hover:opacity-90"
              >
                Return Home
              </a>
            </div>
          </main>
        </div>
      </ThemeProvider>
    );
  }

  const showCorrectAnswers = canViewAny || examSettings.show_correct_answers_to_trainee;

  let reviewRows: any[] = [];
  if (showCorrectAnswers) {
    const { data: eaqRows } = await supabase
      .from("exam_attempt_questions")
      .select("question_number, question_text, correct_answer, explanation")
      .eq("attempt_id", params.attemptId)
      .order("question_number", { ascending: true });

    const { data: answers } = await supabase
      .from("exam_answers")
      .select("question_number, selected_answer")
      .eq("attempt_id", params.attemptId);
    const answerMap = new Map((answers || []).map((a) => [a.question_number, a.selected_answer]));

    reviewRows = (eaqRows || []).map((r) => {
      const selected = answerMap.get(r.question_number);
      return {
        number: r.question_number,
        text: r.question_text,
        selected,
        correct: r.correct_answer,
        explanation: r.explanation,
        isCorrect: selected === r.correct_answer,
      };
    });
  }

  const pass = attempt.pass_fail === "PASS";

  return (
    <ThemeProvider initialTheme={theme}>
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 max-w-2xl mx-auto px-4 sm:px-6 py-12 w-full">
          <div className="rounded-2xl shadow-card p-8 text-center mb-6" style={{ backgroundColor: "var(--card-color)" }}>
            <div
              className={clsx(
                "inline-block px-4 py-1 rounded-full text-sm font-bold mb-4",
                pass ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-100 text-red-700"
              )}
            >
              {attempt.pass_fail ?? "PENDING"}
            </div>
            <h1 className="text-3xl font-bold mb-1" style={{ color: "var(--text-color)" }}>
              {attempt.score_percent != null ? `${(attempt.score_percent * 100).toFixed(1)}%` : "—"}
            </h1>
            <p className="text-gray-500 mb-6">Final Score</p>

            <div className="grid grid-cols-2 gap-4 text-left mb-6">
              <div>
                <div className="text-xs text-gray-500 uppercase">Trainee</div>
                <div className="font-semibold" style={{ color: "var(--text-color)" }}>{attempt.trainee_name}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Duration</div>
                <div className="font-semibold" style={{ color: "var(--text-color)" }}>
                  {attempt.duration_seconds ? `${Math.round(attempt.duration_seconds / 60)} min` : "—"}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Correct</div>
                <div className="font-semibold text-brandGreen-700">{attempt.correct_count ?? "—"}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 uppercase">Wrong</div>
                <div className="font-semibold text-red-600">{attempt.wrong_count ?? "—"}</div>
              </div>
            </div>

            {!showCorrectAnswers && (
              <p className="text-xs text-gray-400">
                Detailed correct answers are not shown for this exam. Contact your administrator for a full review.
              </p>
            )}

            <a
              href="/"
              style={{ backgroundColor: "var(--button-color)" }}
              className="inline-block mt-6 px-6 py-3 rounded-lg font-semibold text-navy-900 hover:opacity-90"
            >
              Return Home
            </a>
          </div>

          {showCorrectAnswers && reviewRows.length > 0 && (
            <div className="rounded-2xl shadow-card p-6" style={{ backgroundColor: "var(--card-color)" }}>
              <h2 className="font-semibold mb-4" style={{ color: "var(--text-color)" }}>Answer Review</h2>
              <div className="space-y-3">
                {reviewRows.map((r) => (
                  <div key={r.number} className="border-b border-gray-100 pb-3 last:border-0">
                    <p className="text-sm font-medium mb-1" style={{ color: "var(--text-color)" }}>
                      {r.number}. {r.text}
                    </p>
                    <p className={clsx("text-xs", r.isCorrect ? "text-brandGreen-700" : "text-red-600")}>
                      Your answer: {r.selected ?? "—"} {r.isCorrect ? "✓ Correct" : `✖ Correct answer: ${r.correct}`}
                    </p>
                    {r.explanation && !r.isCorrect && (
                      <p className="text-xs text-gray-500 mt-1">{r.explanation}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </ThemeProvider>
  );
}
