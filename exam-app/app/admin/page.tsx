import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import StatCard from "@/components/StatCard";
import CategoryStatusTable from "@/components/CategoryStatusTable";
import PreviewExamButton from "@/components/PreviewExamButton";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerSideProfile } from "@/lib/themeServer";
import { loadExamSettings, getQuestionPoolStats } from "@/lib/examEngine";
import { computeExamWarnings } from "@/lib/examValidation";

export default async function AdminDashboard() {
  const supabase = supabaseAdmin();
  const viewer = await getServerSideProfile();

  const { count: totalCategories } = await supabase.from("categories").select("*", { count: "exact", head: true });
  const { count: completedExams } = await supabase
    .from("exam_attempts")
    .select("*", { count: "exact", head: true })
    .eq("status", "completed");
  const { count: totalUsers } = await supabase.from("profiles").select("*", { count: "exact", head: true });

  const { data: scores } = await supabase
    .from("exam_attempts")
    .select("score_percent, pass_fail")
    .eq("status", "completed");

  const avgScore =
    scores && scores.length > 0
      ? scores.reduce((sum, s) => sum + (s.score_percent || 0), 0) / scores.length
      : 0;
  const passRate =
    scores && scores.length > 0 ? scores.filter((s) => s.pass_fail === "PASS").length / scores.length : 0;

  // ---- Exam configuration stats (shared logic with /admin/exam-settings) --
  const examSettings = await loadExamSettings();
  const poolStats = await getQuestionPoolStats();
  const preview = computeExamWarnings(examSettings, poolStats);

  const categoryRows = poolStats.categories.map((c) => ({
    category_id: c.category_id,
    name: c.name,
    available: c.activeNonMandatoryCount,
    needed: examSettings.selection_mode === "fixed_category_rules" ? c.ruleQuestionsToTake : 0,
  }));

  const isSuperAdmin = viewer?.role_id === "super_admin";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Dashboard</h1>

          {isSuperAdmin && preview.canBuild && (
            <div className="card p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="font-semibold text-navy-900">Test the exam yourself</h2>
                <p className="text-sm text-gray-500">Go through the full exam exactly as a trainee would.</p>
              </div>
              <PreviewExamButton />
            </div>
          )}

          {!preview.canBuild && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm space-y-1">
              <p className="font-semibold">⚠ The app cannot currently generate a full exam.</p>
              {preview.warnings
                .filter((w) => w.level === "error")
                .map((w, i) => <p key={i}>{w.message}</p>)}
              {isSuperAdmin && (
                <a href="/admin/exam-settings" className="underline font-medium">Fix in Exam Settings →</a>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
            <StatCard label="Total Active Questions" value={poolStats.totalActiveQuestions} />
            <StatCard label="Always Included" value={poolStats.alwaysIncludeActiveCount} accent="teal" />
            <StatCard label="Total Exam Size" value={examSettings.total_questions} />
            <StatCard label="Random Questions Needed" value={preview.remainingNeeded} accent="teal" />
            <StatCard label="Categories" value={totalCategories ?? 0} />
            <StatCard label="Users" value={totalUsers ?? 0} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Completed Exams" value={completedExams ?? 0} accent="teal" />
            <StatCard label="Average Score" value={`${(avgScore * 100).toFixed(1)}%`} accent="green" />
            <StatCard label="Pass Rate" value={`${(passRate * 100).toFixed(1)}%`} accent="green" />
            <StatCard label="Can Generate Exam?" value={preview.canBuild ? "Yes" : "No"} accent={preview.canBuild ? "green" : "navy"} />
          </div>

          {preview.warnings.some((w) => w.level === "warning") && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm space-y-1">
              {preview.warnings.filter((w) => w.level === "warning").map((w, i) => <p key={i}>⚠ {w.message}</p>)}
            </div>
          )}

          <div>
            <h2 className="text-lg font-semibold text-navy-900 mb-3">
              Category Question Counts
              {examSettings.selection_mode === "auto_distribute" && (
                <span className="text-xs font-normal text-gray-400 ml-2">(auto-distribute mode — fixed targets not used)</span>
              )}
            </h2>
            <CategoryStatusTable rows={categoryRows} />
          </div>

          {isSuperAdmin && (
            <p className="text-sm space-x-4">
              <a href="/admin/exam-settings" className="text-teal-700 hover:underline">Exam Settings →</a>
              <a href="/admin/audit" className="text-teal-700 hover:underline">View full audit log →</a>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
