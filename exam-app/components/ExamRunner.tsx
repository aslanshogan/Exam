"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import QuestionCard from "@/components/QuestionCard";
import ProgressBar from "@/components/ProgressBar";
import type { ExamQuestionView } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";

type OverviewQ = {
  question_number: number;
  answered: boolean;
  selected_answer: string | null;
  category_name: string;
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
  correct_answer?: string;
  explanation?: string;
};

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

  const [isPreview, setIsPreview] = useState(false);
  const [overview, setOverview] = useState<OverviewQ[]>([]);
  const [viewAll, setViewAll] = useState(false);
  const [unansweredNumbers, setUnansweredNumbers] = useState<number[]>([]);

  const loadOverview = useCallback(async () => {
    if (!attemptId) return;
    const { ok, data } = await apiFetch(`/api/exam/overview?attempt=${attemptId}`);
    if (ok && data) {
      setIsPreview(!!data.isPreview);
      setOverview(data.questions || []);
      setTotal(data.total || (data.questions || []).length || 50);
    }
  }, [attemptId]);

  // ---- Keep TRAINEES in the exam (admins previewing are exempt) -----
  // A website cannot fully trap someone (no blocking Alt-Tab / the OS).
  // For real trainees we warn on leave + count tab-switches. For an
  // ADMIN PREVIEW we skip all of that, since the admin is just testing
  // and should be able to leave freely.
  useEffect(() => {
    if (finished || isPreview) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
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
  }, [finished, isPreview]);

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
    loadOverview();
    loadQuestion(qNum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attemptId, qNum]);

  async function handleAnswer(letter: "A" | "B" | "C" | "D") {
    if (!attemptId || !question) return;
    const prev = question.selected_answer;
    setQuestion({ ...question, selected_answer: letter }); // optimistic UI
    // keep the navigator in sync immediately
    setOverview((ov) => ov.map((o) => (o.question_number === question.question_number ? { ...o, answered: true, selected_answer: letter } : o)));
    const { ok, error } = await apiFetch("/api/exam/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, questionNumber: question.question_number, selectedAnswer: letter }),
    });
    if (!ok) {
      setQuestion((q) => (q ? { ...q, selected_answer: prev } : q));
      setOverview((ov) => ov.map((o) => (o.question_number === question.question_number ? { ...o, answered: !!prev, selected_answer: prev } : o)));
      setError(error || "Your answer didn't save — check your connection and tap it again.");
    }
  }

  // Answer directly from the "view all" list (admin or trainee).
  async function answerInList(questionNumber: number, letter: "A" | "B" | "C" | "D") {
    if (!attemptId) return;
    setOverview((ov) => ov.map((o) => (o.question_number === questionNumber ? { ...o, answered: true, selected_answer: letter } : o)));
    const { ok, error } = await apiFetch("/api/exam/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId, questionNumber, selectedAnswer: letter }),
    });
    if (!ok) setError(error || "Your answer didn't save — try again.");
  }

  function goNext() {
    if (qNum < total) setQNum(qNum + 1);
  }
  function goBack() {
    if (qNum > 1) setQNum(qNum - 1);
  }
  function jumpTo(n: number) {
    setViewAll(false);
    setQNum(n);
  }

  async function handleSubmit() {
    if (!attemptId) return;
    if (!confirm("Submit exam now? You cannot change your answers after this.")) return;
    setSubmitting(true);
    setError(null);
    setUnansweredNumbers([]);
    const { ok, status, data, error } = await apiFetch("/api/exam/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptId }),
    });
    if (!ok) {
      setSubmitting(false);
      // 422 = some questions unanswered; show WHICH ones and let them jump.
      if (status === 422 && data?.unansweredNumbers) {
        setUnansweredNumbers(data.unansweredNumbers);
        setError(
          `You still have ${data.unansweredNumbers.length} unanswered question(s): ${data.unansweredNumbers.join(", ")}. Tap a number below to go straight to it.`
        );
        await loadOverview();
        return;
      }
      setError(error || "Could not submit exam.");
      return;
    }
    setFinished(true);
    router.push(`/result/${attemptId}`);
  }

  function exitPreview() {
    if (!confirm("Leave the preview? This preview attempt won't be scored.")) return;
    setFinished(true);
    router.push("/admin");
  }

  const answeredCount = overview.filter((o) => o.answered).length;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <span className="font-bold text-navy-900">
            {isPreview ? "Exam preview (admin)" : "Exam in progress"}
          </span>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewAll((v) => !v)}
              className="text-xs font-semibold text-teal-700 hover:underline"
            >
              {viewAll ? "◱ One at a time" : "▦ View all questions"}
            </button>
            {isPreview ? (
              <button onClick={exitPreview} className="text-xs font-semibold text-red-600 hover:underline">
                Exit preview
              </button>
            ) : (
              <span className="text-xs text-gray-400 hidden sm:inline">Do not close this tab until you submit</span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 py-8 w-full">
        <div className="mb-4">
          <ProgressBar current={viewAll ? total : qNum} total={total} />
          <p className="text-xs text-gray-500 mt-1">{answeredCount} of {total} answered</p>
        </div>

        {/* Question navigator — jump to any question; see answered vs not */}
        {overview.length > 0 && (
          <div className="card p-3 mb-6">
            <div className="flex flex-wrap gap-1.5">
              {overview.map((o) => {
                const isCurrent = !viewAll && o.question_number === qNum;
                const isUnanswered = unansweredNumbers.includes(o.question_number);
                return (
                  <button
                    key={o.question_number}
                    onClick={() => jumpTo(o.question_number)}
                    title={o.answered ? "Answered" : "Not answered"}
                    className={
                      "w-9 h-9 rounded-md text-xs font-semibold border transition-colors " +
                      (isCurrent
                        ? "bg-navy-900 text-white border-navy-900"
                        : isUnanswered
                        ? "bg-red-100 text-red-700 border-red-300"
                        : o.answered
                        ? "bg-brandGreen/15 text-brandGreen-700 border-brandGreen/30"
                        : "bg-white text-gray-500 border-gray-300 hover:bg-gray-50")
                    }
                  >
                    {o.question_number}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
              <span><span className="inline-block w-3 h-3 rounded-sm bg-brandGreen/15 border border-brandGreen/30 align-middle" /> Answered</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-white border border-gray-300 align-middle" /> Not yet</span>
              <span><span className="inline-block w-3 h-3 rounded-sm bg-navy-900 align-middle" /> Current</span>
            </div>
          </div>
        )}

        {awayCount > 0 && !isPreview && (
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

        {viewAll ? (
          /* ---- VIEW ALL: every question on one page ---- */
          <div className="space-y-4">
            {overview.map((o) => (
              <div key={o.question_number} className="card p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-xs font-semibold text-gray-400">
                    Q{o.question_number} · {o.category_name}
                  </span>
                  {o.answered && <span className="text-xs text-brandGreen-700 font-semibold">Answered: {o.selected_answer}</span>}
                </div>
                <p className="font-medium text-navy-900 mb-3">{o.question_text}</p>
                <div className="space-y-2">
                  {(["A", "B", "C", "D"] as const).map((L) => {
                    const val = (o as any)[`answer_${L.toLowerCase()}`] as string;
                    const chosen = o.selected_answer === L;
                    const correct = isPreview && o.correct_answer === L;
                    return (
                      <button
                        key={L}
                        onClick={() => answerInList(o.question_number, L)}
                        className={
                          "w-full text-left px-4 py-2 rounded-lg border text-sm transition-colors " +
                          (chosen
                            ? "border-navy-900 bg-navy-900/5 font-semibold"
                            : "border-gray-200 hover:bg-gray-50") +
                          (correct ? " ring-1 ring-brandGreen-500" : "")
                        }
                      >
                        <span className="font-semibold mr-2">{L}.</span>{val}
                        {correct && <span className="ml-2 text-xs text-brandGreen-700">(correct)</span>}
                      </button>
                    );
                  })}
                </div>
                {isPreview && o.explanation && (
                  <p className="mt-2 text-xs text-gray-500">Explanation: {o.explanation}</p>
                )}
              </div>
            ))}
            <div className="flex justify-end pt-2">
              {!isPreview && (
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
          </div>
        ) : (
          /* ---- ONE AT A TIME ---- */
          <>
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
          </>
        )}
      </main>
    </div>
  );
}
