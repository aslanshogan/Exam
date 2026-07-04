import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export default async function AdminAuditPage() {
  const supabase = supabaseAdmin();
  const { data: logs } = await supabase
    .from("audit_logs")
    .select("id, action, target_type, target_id, metadata, created_at, profiles(display_name)")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Audit Log</h1>
          <p className="text-sm text-gray-500">Most recent 200 admin actions across the whole app.</p>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3">When</th>
                  <th className="text-left px-4 py-3">Who</th>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody>
                {(logs || []).map((l: any, i: number) => (
                  <tr key={l.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 text-gray-500">{new Date(l.created_at).toLocaleString()}</td>
                    <td className="px-4 py-3">{l.profiles?.display_name ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-navy-900">{l.action}</td>
                    <td className="px-4 py-3 text-gray-500">
                      {l.target_type ? `${l.target_type}${l.target_id ? ` · ${l.target_id.slice(0, 8)}` : ""}` : "—"}
                    </td>
                  </tr>
                ))}
                {(!logs || logs.length === 0) && (
                  <tr><td className="px-4 py-6 text-center text-gray-400" colSpan={4}>No audit entries yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
