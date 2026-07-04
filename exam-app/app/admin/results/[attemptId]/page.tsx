import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerSideProfile } from "@/lib/themeServer";
import { logAudit } from "@/lib/auditLog";
import clsx from "clsx";

export default async function AdminResultDetailPage({ params }: { params: { attemptId: string } }) {
  const supabase = supabaseAdmin();

  const viewer = await getServerSideProfile();
  if (viewer) {
    await logAudit(viewer.id, "exam_reviewed", "exam_attempt", params.attemptId);
  }

  const { data: attempt } = await supabase.from("exam_attempts").select("*").eq("id", params.attemptId).single();

  const { data: eaqRows } = await supabase
    .from("exam_attempt_questions")
    .select("question_number, category_name, question_text, correct_answer")
    .eq("attempt_id", params.attemptId)
    .order("question_number", { ascending: true });

  const { data: answers } = await supabase
    .from("exam_answers")
    .select("question_number, selected_answer")
    .eq("attempt_id", params.attemptId);
  const answerMap = new Map((answers || []).map((a) => [a.question_number, a.selected_answer]));

  if (!attempt) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 p-8 text-center text-gray-500">Attempt not found.</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <div className="card p-5 flex flex-wrap justify-between gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase">Trainee</div>
              <div className="font-bold text-navy-900">{attempt.trainee_name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Score</div>
              <div className="font-bold text-navy-900">
                {attempt.score_percent != null ? `${(attempt.score_percent * 100).toFixed(1)}%` : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Result</div>
              <div className={clsx("font-bold", attempt.pass_fail === "PASS" ? "text-brandGreen-700" : "text-red-600")}>
                {attempt.pass_fail}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Date</div>
              <div className="font-bold text-navy-900">{new Date(attempt.started_at).toLocaleString()}</div>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="text-left px-3 py-2">#</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">Question</th>
                  <th className="text-left px-3 py-2">Selected</th>
                  <th className="text-left px-3 py-2">Correct</th>
                  <th className="text-left px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {(eaqRows || []).map((r, i) => {
                  const selected = answerMap.get(r.question_number);
                  const isCorrect = r.correct_answer === selected;
                  return (
                    <tr key={r.question_number} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="px-3 py-2">{r.question_number}</td>
                      <td className="px-3 py-2">{r.category_name}</td>
                      <td className="px-3 py-2 max-w-sm">{r.question_text}</td>
                      <td className="px-3 py-2">{selected ?? "—"}</td>
                      <td className="px-3 py-2">{r.correct_answer}</td>
                      <td className="px-3 py-2">
                        <span
                          className={clsx(
                            "px-2 py-1 rounded-full text-xs font-bold",
                            isCorrect ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-100 text-red-700"
                          )}
                        >
                          {isCorrect ? "Correct" : "Wrong"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
