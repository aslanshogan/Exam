import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import ResultsTable from "@/components/ResultsTable";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerSideProfile } from "@/lib/themeServer";

export default async function AdminResultsPage({
  searchParams,
}: {
  searchParams: { name?: string; pass?: string; from?: string; to?: string };
}) {
  const viewer = await getServerSideProfile();
  const supabase = supabaseAdmin();
  let query = supabase
    .from("exam_attempts")
    .select("id, trainee_name, started_at, score_percent, correct_count, wrong_count, pass_fail")
    .eq("status", "completed")
    .order("started_at", { ascending: false });

  if (searchParams.name) query = query.ilike("trainee_name", `%${searchParams.name}%`);
  if (searchParams.pass) query = query.eq("pass_fail", searchParams.pass.toUpperCase());
  if (searchParams.from) query = query.gte("started_at", searchParams.from);
  if (searchParams.to) query = query.lte("started_at", searchParams.to);

  const { data: rows } = await query;

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-navy-900">Exam Results</h1>
            <div className="flex gap-2">
              {viewer?.role_id === "super_admin" && (
                <a href="/admin/data" className="bg-white border border-gray-300 text-navy-900 font-semibold px-4 py-2 rounded-lg hover:bg-gray-50 text-sm">
                  Data Management
                </a>
              )}
              <a
                href={`/api/admin/results/export${buildQS(searchParams)}`}
                className="bg-teal-700 text-white font-semibold px-4 py-2 rounded-lg hover:bg-teal-600 text-sm"
              >
                Export CSV
              </a>
            </div>
          </div>

          <form className="card p-4 flex flex-wrap gap-3 items-end" method="get">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Trainee name</label>
              <input name="name" defaultValue={searchParams.name} className="border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pass / Fail</label>
              <select name="pass" defaultValue={searchParams.pass} className="border rounded-lg px-3 py-2">
                <option value="">All</option>
                <option value="PASS">Pass</option>
                <option value="FAIL">Fail</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input type="date" name="from" defaultValue={searchParams.from} className="border rounded-lg px-3 py-2" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input type="date" name="to" defaultValue={searchParams.to} className="border rounded-lg px-3 py-2" />
            </div>
            <button className="bg-navy-900 text-white px-5 py-2 rounded-lg font-semibold">Filter</button>
          </form>

          <ResultsTable rows={rows || []} canDelete={viewer?.role_id === "super_admin"} />
        </div>
      </main>
    </div>
  );
}

function buildQS(sp: Record<string, string | undefined>) {
  const parts = Object.entries(sp)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`);
  return parts.length ? `?${parts.join("&")}` : "";
}
