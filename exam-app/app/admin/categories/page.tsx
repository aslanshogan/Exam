"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import { apiFetch } from "@/lib/apiFetch";

type Rule = {
  category_id: string;
  questions_to_take: number;
  categories: { id: string; name: string };
};

export default function AdminCategoriesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [questionCounts, setQuestionCounts] = useState<Record<string, number>>({});
  const [configuredTotal, setConfiguredTotal] = useState<number | null>(null);
  const [newName, setNewName] = useState("");
  const [newCount, setNewCount] = useState(2);
  const [pageError, setPageError] = useState<string | null>(null);

  async function load() {
    const { ok, data, error } = await apiFetch("/api/admin/categories");
    if (!ok || !data) { setPageError(error || "Could not load categories."); return; }
    setPageError(null);
    setRules(data.rules || []);

    const qResult = await apiFetch("/api/admin/questions");
    const counts: Record<string, number> = {};
    if (qResult.ok && qResult.data) {
      for (const q of qResult.data.questions || []) {
        counts[q.category_id] = (counts[q.category_id] || 0) + 1;
      }
    }
    setQuestionCounts(counts);

    const settingsResult = await apiFetch("/api/admin/exam-settings");
    if (settingsResult.ok && settingsResult.data) {
      setConfiguredTotal(settingsResult.data.settings?.total_questions ?? null);
    }
  }
  useEffect(() => { load(); }, []);

  async function addCategory() {
    if (!newName.trim()) return;
    const { ok, error } = await apiFetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), questions_to_take: newCount }),
    });
    if (ok) {
      setNewName("");
      setNewCount(2);
      setPageError(null);
      load();
    } else {
      setPageError(error || "Could not add category.");
    }
  }

  async function updateCount(category_id: string, questions_to_take: number) {
    const { ok, error } = await apiFetch("/api/admin/categories", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category_id, questions_to_take }),
    });
    if (!ok) { setPageError(error || "Could not update category."); return; }
    setPageError(null);
    load();
  }

  async function deleteCategory(category_id: string, categoryName: string) {
    const questionCount = questionCounts[category_id] || 0;
    const typed = prompt(
      `Delete category "${categoryName}"? This will permanently delete it AND all ${questionCount} question(s) inside it — this cannot be undone.\n\n` +
      `Consider exporting/backing up first (Supabase dashboard → Database → Backups).\n\n` +
      `Type the category name exactly to confirm: ${categoryName}`
    );
    if (typed !== categoryName) {
      if (typed !== null) alert("Category name didn't match — nothing was deleted.");
      return;
    }
    const { ok, error } = await apiFetch(`/api/admin/categories?category_id=${category_id}`, { method: "DELETE" });
    if (!ok) { setPageError(error || "Could not delete category."); return; }
    setPageError(null);
    load();
  }

  const total = rules.reduce((sum, r) => sum + r.questions_to_take, 0);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Categories &amp; Rules</h1>

          {pageError && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{pageError}</p>
          )}

          <div
            className={`rounded-lg px-4 py-3 text-sm ${
              configuredTotal == null || total === configuredTotal ? "bg-brandGreen/10 text-brandGreen-700" : "bg-amber-50 text-amber-800"
            }`}
          >
            Fixed-rule total: <strong>{total}</strong> questions across {rules.length} categories.
            {configuredTotal != null && (
              <> Configured exam size is <strong>{configuredTotal}</strong>
                {total !== configuredTotal && " — these don't match. If Selection Mode is \"Fixed Category Rules\" in /admin/exam-settings, the engine will trim or top up randomly to hit the configured total exactly; adjust the counts below if you'd rather control this precisely."}
              </>
            )}
          </div>

          <div className="card p-5">
            <h2 className="font-semibold text-navy-900 mb-3">Add Category</h2>
            <div className="flex gap-3">
              <input
                className="border rounded-lg px-3 py-2 flex-1"
                placeholder="Category name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <input
                type="number"
                className="border rounded-lg px-3 py-2 w-28"
                value={newCount}
                onChange={(e) => setNewCount(Number(e.target.value))}
              />
              <button onClick={addCategory} className="bg-brandGreen text-navy-900 font-bold px-5 py-2 rounded-lg">
                Add
              </button>
            </div>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-navy-900 text-white">
                <tr>
                  <th className="text-left px-4 py-3">Category</th>
                  <th className="text-left px-4 py-3">Questions Available</th>
                  <th className="text-left px-4 py-3">Questions to Take</th>
                  <th className="text-left px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={r.category_id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="px-4 py-3 font-medium text-navy-900">{r.categories?.name}</td>
                    <td className="px-4 py-3 text-gray-500">{questionCounts[r.category_id] ?? 0}</td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        className="border rounded px-2 py-1 w-20"
                        defaultValue={r.questions_to_take}
                        onBlur={(e) => updateCount(r.category_id, Number(e.target.value))}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => deleteCategory(r.category_id, r.categories?.name)}
                        className="text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </main>
    </div>
  );
}
