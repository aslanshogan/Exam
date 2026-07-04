"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QuestionCard from "@/components/QuestionCard";
import ProgressBar from "@/components/ProgressBar";
import type { ExamQuestionView } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";

export default function ExamRunner() {
  const router = useRouter();
  const params = useSearchParams();
  const attemptId = params.get("attempt");

  const [qNum, setQNum] = useState(1);
  const [total, setTotal] = useState(50);
  const [question, setQuestion] = useState<ExamQuestionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const [awayCount, setAwayCount] = useState(0);

  // ---- Keep the person IN the exam --------------------------------
  // Browsers do not allow a web page to fully trap someone (you can't
  // block Alt-Tab, closing the tab by force, or the OS). What we CAN do:
  //   1. Warn with the native "Leave site? Changes may be lost" dialog
  //      if they try to close/reload/navigate away mid-exam.
  //   2. Detect when they switch away from the exam tab/window and count
  //      it, so leaving is discouraged and (optionally) visible to you.
  // These are standard online-exam guardrails; true lockdown needs a
  // dedicated kiosk/lockdown browser, which a normal website can't be.
  useEffect(() => {
    if (finished) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // triggers the browser's confirm dialog
    };
    const onVisibility = () => {
      if (document.hidden) setAwayCount((c) => c + 1);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [finished]);

  const loadQuestion = useCallback(async (n: number) => {
    if (!attemptId) return;
    setLoading(true);
    setError(null);
    const { ok, data, error } = await apiFetch(`/api/exam/question?attempt=${attemptId}&n=${n}`);
    if (!ok || !data) {
      setError(error || "Could not load question.");
      setLoading(false);
      return;
    }
    setQuestion({
      question_number: data.question_number,
      question_id: data.question_id,
      category_name: data.category_name,
      question_text: data.question_text,
      answer_a: data.answer_a,
      answer_b: data.answer_b,
      answer_c: data.answer_c,
      answer_d: data.answer_d,
      selected_answer: data.selected_answer,
    });
    setTotal(data.total_questions);
    setLoading(false);
  }, [attemptId]);

  useEffect(() => {
    if (!attemptId) {
      router.replace("/");
      return;
    }
    loadQuestion(qNum);
  }, [attemptId, qNum, loadQuestion, router]);

  async function handleAnswer(letter: "A" | "B" | "C" | "D") {
    if (!attemptId || !question) return;
    const prev = question.selected_answer;
    setQuestion({ ...question, selected_answer: letter }); // optimistic UI
    const { ok, error } = await apiFetch("/api/exam/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, questionNumber: question.question_number, selectedAnswer: letter }),
    });
    if (!ok) {
      // Roll back the optimistic selection and tell the user, rather than
      // letting the answer silently fail to save.
      setQuestion((q) => (q ? { ...q, selected_answer: prev } : q));
      setError(error || "Your answer didn't save — check your connection and tap it again.");
    }
  }

  function goNext() {
    if (qNum < total) setQNum(qNum + 1);
  }
  function goBack() {
    if (qNum > 1) setQNum(qNum - 1);
  }

  async function handleSubmit() {
    if (!attemptId) return;
    if (!confirm("Submit exam now? You cannot change your answers after this.")) return;
    setSubmitting(true);
    setError(null);
    const { ok, error } = await apiFetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId }),
    });
    if (!ok) {
      setError(error || "Could not submit exam.");
      setSubmitting(false);
      return;
    }
    setFinished(true); // stop the beforeunload guard before navigating
    router.push(`/result/${attemptId}`);
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Minimal exam header — deliberately NO site navigation, so the
          person can't casually click out of the exam mid-attempt. */}
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <span className="font-bold text-navy-900">Exam in progress</span>
          <span className="text-xs text-gray-400">Do not close this tab until you submit</span>
        </div>
      </header>
      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-8 w-full">
        <div className="mb-6">
          <ProgressBar current={qNum} total={total} />
        </div>

        {awayCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-3 mb-4 text-sm">
            You've left this exam tab {awayCount} time{awayCount === 1 ? "" : "s"}. Please stay on this
            page until you finish and submit.
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">
            {error}
          </div>
        )}

        {loading || !question ? (
          <div className="card p-8 text-center text-gray-500">Loading question...</div>
        ) : (
          <QuestionCard q={question} onAnswer={handleAnswer} />
        )}

        <div className="flex justify-between items-center mt-6">
          <button
            onClick={goBack}
            disabled={qNum === 1}
            className="px-6 py-3 rounded-lg font-semibold bg-white border border-gray-300 text-navy-900 disabled:opacity-40 hover:bg-gray-50"
          >
            ◀ Back
          </button>

          {qNum < total ? (
            <button
              onClick={goNext}
              style={{ backgroundColor: "var(--accent-color)" }}
              className="px-6 py-3 rounded-lg font-semibold text-white hover:opacity-90"
            >
              Next ▶
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ backgroundColor: "var(--button-color)" }}
              className="px-6 py-3 rounded-lg font-semibold text-navy-900 hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "✔ Submit Exam"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
