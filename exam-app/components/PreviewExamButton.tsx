"use client";

import { useState } from "react";

/**
 * PreviewExamButton — lets a Super Admin take the exam to test it,
 * without needing a trainee account. Posts to /api/exam/preview-start
 * (which flags the attempt is_preview=true and does NOT consume any
 * trainee attempts), then navigates into the normal exam flow.
 */
export default function PreviewExamButton({ className = "" }: { className?: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    let res: Response;
    try {
      res = await fetch("/api/exam/preview-start", { method: "POST" });
    } catch (e: any) {
      setLoading(false);
      setError(`Network error: ${e?.message || e}`);
      return;
    }
    const text = await res.text();
    let data: any;
    try { data = JSON.parse(text); } catch { data = { error: text }; }

    if (!res.ok) {
      setLoading(false);
      if (res.status === 401) { setError("Session expired, please sign in again."); return; }
      if (res.status === 403) { setError("You do not have permission to preview the exam."); return; }
      setError(data.error || `Could not start preview (HTTP ${res.status}).`);
      return;
    }
    window.location.href = `/exam?attempt=${data.attemptId}`;
  }

  return (
    <div className={className}>
      <button
        onClick={start}
        disabled={loading}
        className="bg-navy-900 text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-navy-700 disabled:opacity-60"
      >
        {loading ? "Generating..." : "▶ Preview Exam as Admin"}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      <p className="text-xs text-gray-400 mt-1">
        Takes the real exam using current settings. Doesn't use any trainee attempt; the result is
        labelled "Admin Preview".
      </p>
    </div>
  );
}
