"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/apiFetch";

export default function StartExamButton({
  canStart,
  blockedReason,
}: {
  canStart: boolean;
  blockedReason: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    const { ok, data, error } = await apiFetch("/api/exam/start", { method: "POST" });
    if (!ok || !data) {
      setError(error || "Could not start the exam.");
      setLoading(false);
      return;
    }
    window.location.href = `/exam?attempt=${data.attemptId}`;
  }

  if (!canStart) {
    return (
      <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 text-sm">
        {blockedReason || "You are not currently approved to take this exam. Contact your administrator."}
      </div>
    );
  }

  return (
    <div>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <button
        onClick={start}
        disabled={loading}
        style={{ backgroundColor: "var(--button-color)" }}
        className="w-full text-navy-900 font-bold py-3 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
      >
        {loading ? "Preparing exam..." : "Start Exam"}
      </button>
    </div>
  );
}
