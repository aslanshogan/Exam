"use client";

import { useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import ImportReport, { ImportReportData } from "@/components/ImportReport";

export default function AdminImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [replaceAll, setReplaceAll] = useState(false);
  const [report, setReport] = useState<ImportReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    if (!file) return;

    if (replaceAll) {
      const typed = prompt(
        'This will PERMANENTLY DELETE every existing question before importing this file.\n\n' +
        'This cannot be undone — export your current question bank first if you might need it ' +
        '(open /admin/questions in another tab, or back up your database in Supabase).\n\n' +
        'Type DELETE to confirm:'
      );
      if (typed !== "DELETE") {
        setError("Replace cancelled — you must type DELETE exactly to confirm.");
        return;
      }
    }

    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("replaceAll", replaceAll ? "true" : "false");
    const res = await fetch("/api/admin/import", { method: "POST", body: formData });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Import failed.");
      return;
    }
    setReport(data);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Excel Import</h1>

          <div className="card p-5">
            <p className="text-sm text-gray-600 mb-4">
              Upload your source <code>.xlsx</code> question bank. Each sheet/tab is treated as one
              category. New categories are created automatically (with a default rule of 2
              questions); existing categories with the same name are matched and reused.
              By default, importing only <strong>adds</strong> questions, and automatically
              <strong> skips anything that looks like a duplicate</strong> of a question already in
              the same category (or a duplicate within the file itself) — duplicates are listed in
              the report below, not silently imported.
            </p>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block mb-4"
            />

            <label className="flex items-start gap-2 text-sm mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <input
                type="checkbox"
                checked={replaceAll}
                onChange={(e) => setReplaceAll(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                <strong>Replace entire question bank with this file</strong> — deletes ALL existing
                questions first, then imports fresh from this file. Categories and category rules
                are left untouched. You'll be asked to type a confirmation before this runs.
              </span>
            </label>

            <button
              onClick={handleImport}
              disabled={!file || loading}
              className={`font-bold px-5 py-2 rounded-lg disabled:opacity-50 ${replaceAll ? "bg-red-600 text-white hover:bg-red-700" : "bg-brandGreen text-navy-900"}`}
            >
              {loading ? "Importing..." : replaceAll ? "Replace & Import" : "Run Import"}
            </button>
            {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
          </div>

          {report && <ImportReport report={report} />}

          <div className="card p-5 text-sm text-gray-600">
            <p className="font-semibold text-navy-900 mb-2">Prefer the command line?</p>
            <p>
              Place your file at <code>/data/source-questions.xlsx</code> in the project and run{" "}
              <code>npm run import:excel</code> (add <code>-- --replace</code> to wipe existing
              questions first, with a confirmation prompt). It uses the identical parsing and
              duplicate-detection logic, and writes a full <code>import-report.json</code> file you
              can review and re-run after fixing your source spreadsheet.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
