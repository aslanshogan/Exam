"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import { apiFetch } from "@/lib/apiFetch";
import { computeExamWarnings, QuestionPoolStats } from "@/lib/examValidation";
import type { ExamSettings } from "@/lib/types";

export default function AdminExamSettingsPage() {
  const [settings, setSettings] = useState<ExamSettings | null>(null);
  const [stats, setStats] = useState<QuestionPoolStats | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    apiFetch("/api/admin/exam-settings").then(({ ok, data, error }) => {
      if (ok && data) {
        setSettings(data.settings);
        setStats(data.stats);
      } else {
        setMessage(error || "Could not load exam settings.");
      }
    });
  }, []);

  async function previewExam() {
    setPreviewing(true);
    setMessage(null);
    const { ok, data, error } = await apiFetch("/api/exam/preview-start", { method: "POST" });
    setPreviewing(false);
    if (!ok || !data) {
      setMessage(error || "Could not start a preview exam.");
      return;
    }
    window.location.href = `/exam?attempt=${data.attemptId}`;
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setMessage(null);
    const { ok, data, error } = await apiFetch("/api/admin/exam-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    setSaving(false);
    if (!ok || !data) {
      setMessage(error || "Could not save.");
      return;
    }
    setSettings(data.settings);
    setStats(data.stats);
    setMessage("Saved.");
  }

  if (!settings || !stats) {
    return (
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 p-8 text-center text-gray-500">Loading...</main>
      </div>
    );
  }

  const preview = computeExamWarnings(settings, stats);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full flex gap-6">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Exam Settings</h1>

          {/* ---- Live validation preview --------------------------- */}
          <div className={`rounded-lg px-4 py-3 text-sm space-y-1 ${preview.canBuild ? "bg-brandGreen/10 text-brandGreen-700" : "bg-red-50 text-red-700 border border-red-200"}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">
                  {preview.canBuild ? "✅ This configuration can build a full exam." : "⚠ This configuration CANNOT currently build a full exam."}
                </p>
                <p>
                  Mandatory (always-include): <strong>{preview.mandatoryCount}</strong> · Random fill needed:{" "}
                  <strong>{preview.remainingNeeded}</strong> · Available for random fill:{" "}
                  <strong>{preview.totalAvailableForRemaining}</strong>
                </p>
              </div>
              {preview.canBuild && (
                <button
                  onClick={previewExam}
                  disabled={previewing}
                  className="flex-shrink-0 bg-navy-900 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-navy-700 disabled:opacity-60"
                >
                  {previewing ? "Generating..." : "▶ Preview This Exam"}
                </button>
              )}
            </div>
            {preview.warnings.map((w, i) => (
              <p key={i} className={w.level === "error" ? "text-red-700" : "text-amber-700"}>
                {w.level === "error" ? "✖" : "⚠"} {w.message}
              </p>
            ))}
          </div>
          <p className="text-xs text-gray-400 -mt-2">
            "Preview This Exam" generates a real exam under your own account using these settings,
            so you can actually take it and confirm it works. Trainees never see this button — they
            use Start Exam on the Home page, which is what counts toward their attempt limit.
          </p>

          <div className="card p-5 space-y-5 max-w-2xl">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Total Exam Questions</label>
                <input
                  type="number"
                  min={1}
                  value={settings.total_questions}
                  onChange={(e) => setSettings({ ...settings, total_questions: Number(e.target.value) })}
                  className="border rounded-lg px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Passing Score: {Math.round(settings.pass_score * 100)}%
                </label>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(settings.pass_score * 100)}
                  onChange={(e) => setSettings({ ...settings, pass_score: Number(e.target.value) / 100 })}
                  className="w-full mt-3"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Default Questions Per Category</label>
                <input
                  type="number"
                  min={0}
                  value={settings.default_questions_per_category}
                  onChange={(e) => setSettings({ ...settings, default_questions_per_category: Number(e.target.value) })}
                  className="border rounded-lg px-3 py-2 w-full"
                />
                <p className="text-xs text-gray-400 mt-1">Used as the baseline in "Auto-Distribute" mode below.</p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-2">Category Selection Mode</label>
              <div className="flex gap-3">
                <button
                  onClick={() => setSettings({ ...settings, selection_mode: "fixed_category_rules" })}
                  className={`flex-1 px-4 py-3 rounded-lg border text-left ${settings.selection_mode === "fixed_category_rules" ? "border-navy-900 bg-navy-900 text-white" : "border-gray-300"}`}
                >
                  <div className="font-semibold">Use Fixed Category Rules</div>
                  <div className="text-xs opacity-80">Take exactly N questions from each category, as set in Categories &amp; Rules.</div>
                </button>
                <button
                  onClick={() => setSettings({ ...settings, selection_mode: "auto_distribute" })}
                  className={`flex-1 px-4 py-3 rounded-lg border text-left ${settings.selection_mode === "auto_distribute" ? "border-navy-900 bg-navy-900 text-white" : "border-gray-300"}`}
                >
                  <div className="font-semibold">Auto-Distribute Across Categories</div>
                  <div className="text-xs opacity-80">Spread the total automatically across all active categories.</div>
                </button>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-3 text-sm pt-2 border-t">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.include_always_questions} onChange={(e) => setSettings({ ...settings, include_always_questions: e.target.checked })} />
                Include always-include (pinned) questions
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.randomize_question_order} onChange={(e) => setSettings({ ...settings, randomize_question_order: e.target.checked })} />
                Randomize final question order
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.allow_retake} onChange={(e) => setSettings({ ...settings, allow_retake: e.target.checked })} />
                Allow retakes (global master switch)
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.show_result_to_trainee} onChange={(e) => setSettings({ ...settings, show_result_to_trainee: e.target.checked })} />
                Show score screen to trainee after submit
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={settings.show_correct_answers_to_trainee} onChange={(e) => setSettings({ ...settings, show_correct_answers_to_trainee: e.target.checked })} />
                Show correct answers / explanations to trainee
              </label>
            </div>

            <p className="text-xs text-gray-400">
              "Allow retakes" is a global master switch — even when on, each individual trainee's
              own retake/max-attempts setting (in Users → that trainee → Exam Access) still
              applies. Turning this off blocks retakes for everyone regardless of their personal setting.
            </p>

            {message && <p className="text-sm text-teal-700">{message}</p>}
            <button onClick={save} disabled={saving} className="bg-brandGreen text-navy-900 font-bold px-6 py-3 rounded-lg disabled:opacity-60">
              {saving ? "Saving..." : "Save Exam Settings"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
