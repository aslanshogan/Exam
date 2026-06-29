"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import StatCard from "@/components/StatCard";

type Counts = {
  totalQuestions: number;
  totalCategories: number;
  totalAttempts: number;
  completedAttempts: number;
};

export default function AdminDataPage() {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/admin/data/counts");
    if (res.ok) {
      const data = await res.json();
      setCounts(data);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleClearResults() {
    const typed = prompt(
      "This permanently deletes EVERY exam result and resets every trainee's attempt count to 0.\n\n" +
      "This cannot be undone. Export results to CSV first if you might need them " +
      "(Results page → Export CSV), and/or back up your database (Supabase dashboard → Database → Backups).\n\n" +
      'Type "CLEAR RESULTS" exactly to confirm:'
    );
    if (typed !== "CLEAR RESULTS") {
      if (typed !== null) setMessage('Confirmation text didn\'t match — nothing was deleted.');
      return;
    }

    setClearing(true);
    setMessage(null);
    const res = await fetch("/api/admin/data/clear-results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: "CLEAR RESULTS" }),
    });
    const data = await res.json();
    setClearing(false);
    if (!res.ok) {
      setMessage(data.error || "Could not clear results.");
      return;
    }
    setMessage(`Deleted ${data.deletedCount} result(s). Every trainee's attempt count has been reset to 0.`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Data Management</h1>

          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
            ⚠ <strong>Before doing anything below:</strong> export your results to CSV
            (Results page) and consider backing up your database from the Supabase
            dashboard (Project → Database → Backups). Everything on this page is
            either permanent or affects every user at once.
          </div>

          {counts && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Total Questions" value={counts.totalQuestions} />
              <StatCard label="Categories" value={counts.totalCategories} />
              <StatCard label="Total Exam Attempts" value={counts.totalAttempts} accent="teal" />
              <StatCard label="Completed Attempts" value={counts.completedAttempts} accent="teal" />
            </div>
          )}

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-navy-900">Questions &amp; Categories</h2>
            <p className="text-sm text-gray-600">
              Delete individual questions on <a href="/admin/questions" className="text-teal-700 hover:underline">Questions</a> (asks
              for a normal confirmation), or a whole category — and every question inside it — on{" "}
              <a href="/admin/categories" className="text-teal-700 hover:underline">Categories &amp; Rules</a> (requires typing the
              exact category name, since it deletes everything in that category too).
            </p>
            <p className="text-sm text-gray-600">
              To replace the entire question bank at once from a new spreadsheet, use the
              "Replace entire question bank" option on{" "}
              <a href="/admin/import" className="text-teal-700 hover:underline">Excel Import</a>.
            </p>
          </div>

          <div className="card p-5 space-y-3">
            <h2 className="font-semibold text-navy-900">Results</h2>
            <p className="text-sm text-gray-600">
              Export all results to CSV, or delete a single result, from the{" "}
              <a href="/admin/results" className="text-teal-700 hover:underline">Results</a> page.
            </p>
          </div>

          <div className="card p-5 space-y-3 border border-red-200">
            <h2 className="font-semibold text-red-700">Danger Zone</h2>
            <p className="text-sm text-gray-600">
              Permanently delete <strong>every</strong> exam result (completed and in-progress) and
              reset every trainee's attempt count back to 0. Questions, categories, and user accounts
              are not affected.
            </p>
            {message && <p className="text-sm text-teal-700">{message}</p>}
            <button
              onClick={handleClearResults}
              disabled={clearing}
              className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2 rounded-lg disabled:opacity-60"
            >
              {clearing ? "Clearing..." : "Clear All Results"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
