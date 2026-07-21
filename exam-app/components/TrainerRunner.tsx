"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/apiFetch";
import { TRAINER_TOPIC_GROUPS } from "@/lib/trainerTopics";

/**
 * TrainerRunner — the AI Knowledge Trainer.
 * ---------------------------------------------------------------------
 * Flow (per spec):
 *   entry → (continue last session | choose category+difficulty)
 *   → question shown immediately → answer A–D
 *   → feedback (correct/wrong, correct answer, explanation, sources,
 *     video link) → "Next Question" → next question → … forever until
 *     the user exits.
 *
 * There is NO "Generate Question" button. Questions are generated
 * server-side ONLY as a result of an explicit user click (Start /
 * Continue / Next Question) — never on a timer or loop.
 */

type Question = {
  question_number: number;
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
};

type Feedback = {
  correct: boolean;
  selected: string;
  correct_answer: string;
  correct_text: string;
  explanation: string | null;
  sources: { title: string; url: string | null }[];
  video_sources: { title: string; url: string; platform: string; reason: string }[];
  video_link: string | null;
  category: string | null;
  subcategory: string | null;
  difficulty: string | null;
  score: { correct: number; wrong: number };
};

type SessionInfo = { id: string; category: string; difficulty: string; correct_count: number; wrong_count: number };

const DIFFICULTIES = ["easy", "medium", "hard", "mixed"] as const;

export default function TrainerRunner() {
  const router = useRouter();

  const [phase, setPhase] = useState<"loading" | "entry" | "question" | "feedback" | "review">("loading");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);

  const [existing, setExisting] = useState<{ session: SessionInfo; pendingQuestion: Question | null } | null>(null);
  const [topicGroups, setTopicGroups] = useState<{ group: string; topics: string[] }[]>(TRAINER_TOPIC_GROUPS as any);
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [difficulty, setDifficulty] = useState<(typeof DIFFICULTIES)[number]>("medium");

  const [session, setSession] = useState<SessionInfo | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [phaseBeforeReview, setPhaseBeforeReview] = useState<"question" | "feedback" | "entry">("entry");
  const [question, setQuestion] = useState<Question | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    (async () => {
      const sess = await apiFetch("/api/trainer/session");
      if (sess.ok && sess.data?.exists) {
        setExisting({ session: sess.data.session, pendingQuestion: sess.data.pendingQuestion });
      }
      const t = await apiFetch("/api/trainer/topics");
      if (t.ok && t.data?.groups?.length) setTopicGroups(t.data.groups);
      setPhase("entry");
    })();
  }, []);

  function chosenCategory(): string {
    return category === "__custom__" ? customCategory.trim() : category;
  }

  async function startNew() {
    const cat = chosenCategory();
    if (!cat) { setError("Choose a category or type a custom topic."); return; }
    setBusy(true);
    setGenerating(true);
    setError(null);
    const { ok, data, error } = await apiFetch("/api/trainer/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category: cat, difficulty }),
    });
    setBusy(false);
    setGenerating(false);
    if (!ok || !data) { setError(error || "Could not start the trainer."); return; }
    setSession(data.session);
    setScore({ correct: 0, wrong: 0 });
    setQuestion(data.question);
    setFeedback(null);
    setPhase("question");
  }

  async function continueSession() {
    if (!existing) return;
    setSession(existing.session);
    setScore({ correct: existing.session.correct_count, wrong: existing.session.wrong_count });
    setError(null);
    if (existing.pendingQuestion) {
      setQuestion(existing.pendingQuestion);
      setFeedback(null);
      setPhase("question");
      return;
    }
    // No pending question → the user's "Continue" click is the action
    // that triggers generating the next one.
    setBusy(true);
    setGenerating(true);
    const { ok, data, error } = await apiFetch("/api/trainer/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: existing.session.id }),
    });
    setBusy(false);
    setGenerating(false);
    if (!ok || !data) { setError(error || "Could not continue the session."); return; }
    setQuestion(data.question);
    setFeedback(null);
    setPhase("question");
  }

  async function answer(letter: "A" | "B" | "C" | "D") {
    if (!session || !question || busy) return;
    setBusy(true);
    setError(null);
    const { ok, data, error } = await apiFetch("/api/trainer/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id, questionNumber: question.question_number, selected: letter }),
    });
    setBusy(false);
    if (!ok || !data) { setError(error || "Could not check your answer — tap it again."); return; }
    setScore(data.score);
    setFeedback(data);
    setPhase("feedback");
  }

  async function nextQuestion() {
    if (!session || busy) return;
    setBusy(true);
    setGenerating(true);
    setError(null);
    const { ok, data, error } = await apiFetch("/api/trainer/next", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: session.id }),
    });
    setBusy(false);
    setGenerating(false);
    if (!ok || !data) { setError(error || "Could not load the next question — tap Next again."); return; }
    setQuestion(data.question);
    setFeedback(null);
    setPhase("question");
  }

  async function endAndReset() {
    if (existing && confirm("End your saved session? Its score will no longer be continuable.")) {
      await apiFetch("/api/trainer/end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: existing.session.id }),
      });
      setExisting(null);
    }
  }

  const total = score.correct + score.wrong;

  async function openReview() {
    const sid = session?.id || existing?.session.id || "";
    setPhaseBeforeReview(phase === "feedback" ? "feedback" : phase === "question" ? "question" : "entry");
    setLoadingHistory(true);
    setPhase("review");
    const { ok, data } = await apiFetch(`/api/trainer/history${sid ? `?sessionId=${sid}` : ""}`);
    setLoadingHistory(false);
    if (ok && data) setHistory(data.items || []);
  }
  function closeReview() {
    setPhase(phaseBeforeReview);
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <span className="font-bold text-navy-900">🎓 AI Knowledge Trainer</span>
          <div className="flex items-center gap-4">
            {session && (
              <span className="text-sm tabular-nums">
                <span className="text-brandGreen-700 font-semibold">✓ {score.correct}</span>
                {" · "}
                <span className="text-red-600 font-semibold">✗ {score.wrong}</span>
              </span>
            )}
            {(session || existing) && total > 0 && phase !== "review" && (
              <button onClick={openReview} className="text-xs text-teal-700 font-semibold hover:underline">
                📖 Review answered
              </button>
            )}
            <button onClick={() => router.push("/")} className="text-xs text-gray-500 hover:underline">
              Exit
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 py-8 w-full">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 mb-4 text-sm">{error}</div>
        )}

        {phase === "loading" && <div className="card p-8 text-center text-gray-500">Loading...</div>}

        {phase === "review" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-navy-900">Questions you've answered ({history.length})</h2>
              <button onClick={closeReview} className="text-sm text-teal-700 font-semibold hover:underline">
                ← Back to training
              </button>
            </div>

            {loadingHistory ? (
              <div className="card p-8 text-center text-gray-500">Loading your history…</div>
            ) : history.length === 0 ? (
              <div className="card p-8 text-center text-gray-500">You haven't answered any questions yet in this session.</div>
            ) : (
              history.map((h) => (
                <div key={h.question_number} className="card p-5">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-gray-400">Q{h.question_number}</span>
                    {h.subcategory && <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-700/10 text-teal-700 font-semibold">{h.subcategory}</span>}
                    {h.difficulty && <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{h.difficulty}</span>}
                    <span className={"text-[11px] px-2 py-0.5 rounded-full font-semibold " + (h.is_correct ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-50 text-red-700")}>
                      {h.is_correct ? "✓ Correct" : "✗ Wrong"}
                    </span>
                  </div>
                  <p className="font-medium text-navy-900 mb-3">{h.question_text}</p>
                  <div className="space-y-1.5">
                    {(["A", "B", "C", "D"] as const).map((L) => {
                      const chosen = h.selected_answer === L;
                      const correct = h.correct_answer === L;
                      return (
                        <div key={L} className={
                          "text-sm px-3 py-2 rounded-lg border " +
                          (correct ? "border-brandGreen/40 bg-brandGreen/10 " : chosen ? "border-red-300 bg-red-50 " : "border-gray-200 ")
                        }>
                          <span className="font-semibold mr-1">{L}.</span>{h.answers[L]}
                          {correct && <span className="ml-2 text-xs text-brandGreen-700 font-semibold">✓ correct answer</span>}
                          {chosen && !correct && <span className="ml-2 text-xs text-red-600 font-semibold">your answer</span>}
                        </div>
                      );
                    })}
                  </div>
                  {h.explanation && (
                    <p className="mt-3 text-sm text-gray-700"><span className="font-semibold">Why: </span>{h.explanation}</p>
                  )}
                  {h.sources.length > 0 && (
                    <div className="mt-2 text-sm">
                      <span className="text-xs font-bold uppercase text-gray-400">Sources: </span>
                      {h.sources.map((s: any, i: number) => (
                        s.url ? <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline mr-2">🔗 {s.title}</a>
                              : <span key={i} className="text-gray-600 mr-2">{s.title}</span>
                      ))}
                    </div>
                  )}
                  {h.video_sources.length > 0 && (
                    <div className="mt-1 text-sm">
                      {h.video_sources.map((v: any, i: number) => (
                        <a key={i} href={v.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 font-semibold hover:underline block">▶ {v.title} <span className="text-xs text-gray-400 font-normal">({v.platform})</span></a>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}

            <div className="flex justify-center pt-2">
              <button onClick={closeReview} className="px-6 py-3 rounded-lg font-bold text-navy-900 border border-teal-700 hover:bg-teal-700/5">
                ← Back to training
              </button>
            </div>
          </div>
        )}

        {phase === "entry" && (
          <div className="space-y-5">
            {existing && (
              <div className="card p-5">
                <h2 className="font-semibold text-navy-900 mb-1">Continue Last Session</h2>
                <p className="text-sm text-gray-500 mb-3">
                  {existing.session.category} · {existing.session.difficulty} · score so far:{" "}
                  <span className="text-brandGreen-700 font-semibold">✓ {existing.session.correct_count}</span>{" "}
                  <span className="text-red-600 font-semibold">✗ {existing.session.wrong_count}</span>
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={continueSession}
                    disabled={busy}
                    style={{ backgroundColor: "var(--button-color)" }}
                    className="px-5 py-2.5 rounded-lg font-bold text-navy-900 hover:opacity-90 disabled:opacity-60"
                  >
                    {busy ? "Preparing..." : "▶ Continue Last Session"}
                  </button>
                  <button onClick={endAndReset} className="text-sm text-gray-500 hover:underline">
                    End it instead
                  </button>
                </div>
              </div>
            )}

            <div className="card p-5">
              <h2 className="font-semibold text-navy-900 mb-3">{existing ? "Or Start a New Session" : "Start Training"}</h2>
              <div className="space-y-3 max-w-md">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Category / topic</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="border rounded-lg px-3 py-2 w-full"
                  >
                    <option value="">— choose —</option>
                    {topicGroups.map((g) => (
                      <optgroup key={g.group} label={g.group}>
                        {g.topics.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__custom__">Custom topic…</option>
                  </select>
                </div>
                {category === "__custom__" && (
                  <input
                    value={customCategory}
                    onChange={(e) => setCustomCategory(e.target.value)}
                    placeholder="e.g. Francis turbine cavitation"
                    className="border rounded-lg px-3 py-2 w-full"
                  />
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as any)}
                    className="border rounded-lg px-3 py-2 w-full"
                  >
                    {DIFFICULTIES.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={startNew}
                  disabled={busy}
                  style={{ backgroundColor: "var(--button-color)" }}
                  className="w-full py-3 rounded-lg font-bold text-navy-900 hover:opacity-90 disabled:opacity-60"
                >
                  {busy ? "Preparing your first question..." : "Start Training"}
                </button>
                {existing && (
                  <p className="text-xs text-gray-400">Starting a new session ends the saved one above.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {generating && phase !== "entry" && (
          <div className="card p-8 text-center text-gray-500">
            <p className="animate-pulse">Your trainer is preparing the next question…</p>
          </div>
        )}

        {phase === "question" && question && !generating && (
          <div className="card p-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-gray-400">
                Question {question.question_number} · {session?.category} · {session?.difficulty}
              </span>
            </div>
            <p className="font-medium text-navy-900 text-lg mb-5">{question.question_text}</p>
            <div className="space-y-2">
              {(["A", "B", "C", "D"] as const).map((L) => (
                <button
                  key={L}
                  onClick={() => answer(L)}
                  disabled={busy}
                  className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 hover:border-navy-900 hover:bg-navy-900/5 disabled:opacity-60 transition-colors"
                >
                  <span className="font-semibold mr-2">{L}.</span>
                  {(question as any)[`answer_${L.toLowerCase()}`]}
                </button>
              ))}
            </div>
            {busy && <p className="text-xs text-gray-400 mt-3">Checking…</p>}
          </div>
        )}

        {phase === "feedback" && feedback && question && !generating && (
          <div className="space-y-4">
            <div
              className={
                "rounded-xl px-5 py-4 font-bold text-lg " +
                (feedback.correct
                  ? "bg-brandGreen/15 text-brandGreen-700 border border-brandGreen/30"
                  : "bg-red-50 text-red-700 border border-red-200")
              }
            >
              {feedback.correct ? "✓ Correct!" : `✗ Wrong — you chose ${feedback.selected}.`}
              {!feedback.correct && (
                <p className="text-sm font-normal mt-1">
                  Correct answer: <strong>{feedback.correct_answer}. {feedback.correct_text}</strong>
                </p>
              )}
            </div>

            <div className="card p-5">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <p className="text-sm font-semibold text-gray-400">Question {question.question_number}</p>
                {feedback.category && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-navy-900/5 text-navy-900 font-semibold">{feedback.category}</span>
                )}
                {feedback.subcategory && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-700/10 text-teal-700 font-semibold">{feedback.subcategory}</span>
                )}
                {feedback.difficulty && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{feedback.difficulty}</span>
                )}
              </div>
              <p className="font-medium text-navy-900 mb-4">{question.question_text}</p>

              {feedback.explanation && (
                <div className="mb-4">
                  <h3 className="text-xs font-bold uppercase text-gray-400 mb-1">Explanation</h3>
                  <p className="text-sm text-gray-700">{feedback.explanation}</p>
                </div>
              )}

              {feedback.sources.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-bold uppercase text-gray-400 mb-1">Written sources</h3>
                  <ul className="text-sm space-y-1">
                    {feedback.sources.map((s, i) => (
                      <li key={i}>
                        {s.url ? (
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline break-all">
                            🔗 {s.title}
                          </a>
                        ) : (
                          <span className="text-gray-700">{s.title}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {feedback.video_sources.length > 0 ? (
                <div className="mb-1">
                  <h3 className="text-xs font-bold uppercase text-gray-400 mb-1">Video learning</h3>
                  <ul className="text-sm space-y-2">
                    {feedback.video_sources.map((v, i) => (
                      <li key={i} className="border border-gray-200 rounded-lg px-3 py-2">
                        <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 font-semibold hover:underline">
                          ▶ {v.title} <span className="text-xs text-gray-400 font-normal">({v.platform})</span>
                        </a>
                        {v.reason && <p className="text-xs text-gray-500 mt-0.5">{v.reason}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                feedback.video_link && (
                  <a
                    href={feedback.video_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-sm text-teal-700 font-semibold hover:underline"
                  >
                    ▶ Find explainer videos on YouTube
                  </a>
                )
              )}
            </div>

            <div className="flex justify-end">
              <button
                onClick={nextQuestion}
                disabled={busy}
                style={{ backgroundColor: "var(--button-color)" }}
                className="px-6 py-3 rounded-lg font-bold text-navy-900 hover:opacity-90 disabled:opacity-60"
              >
                {busy ? "Preparing..." : "Next Question →"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
