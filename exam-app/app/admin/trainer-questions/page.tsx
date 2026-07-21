"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import { apiFetch } from "@/lib/apiFetch";

type Session = {
  id: string; user: string; category: string; difficulty: string;
  correct: number; wrong: number; status: string; created_at: string; questionCount: number;
  questions?: any[];
};

export default function TrainerQuestionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Session | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    (async () => {
      const { ok, data, error } = await apiFetch("/api/admin/trainer-questions");
      setLoading(false);
      if (!ok || !data) { setError(error || "Could not load."); return; }
      setSessions(data.sessions || []);
    })();
  }, []);

  async function toggle(id: string) {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setLoadingDetail(true);
    const { ok, data } = await apiFetch(`/api/admin/trainer-questions?sessionId=${id}`);
    setLoadingDetail(false);
    if (ok && data?.sessions?.[0]) setDetail(data.sessions[0]);
  }

  function fmtDate(s: string) {
    try { return new Date(s).toLocaleString(); } catch { return s; }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex gap-8">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">Trainer Questions</h1>
          <p className="text-sm text-gray-500 -mt-4">
            Questions the AI Knowledge Trainer generated during practice sessions. These are separate from your
            exam question bank (Admin → Questions). Click a session to see its questions.
          </p>

          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}

          {loading ? (
            <div className="card p-8 text-center text-gray-500">Loading…</div>
          ) : sessions.length === 0 ? (
            <div className="card p-8 text-center text-gray-500">No trainer sessions yet. Once someone uses the AI Knowledge Trainer, sessions appear here.</div>
          ) : (
            <div className="space-y-3">
              {sessions.map((s) => (
                <div key={s.id} className="card p-4">
                  <button onClick={() => toggle(s.id)} className="w-full flex flex-wrap items-center justify-between gap-3 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-navy-900">{s.category}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">{s.difficulty}</span>
                      <span className="text-xs text-gray-500">by {s.user}</span>
                      {s.status !== "active" && <span className="text-[11px] text-gray-400">({s.status})</span>}
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500">{s.questionCount} Qs</span>
                      <span className="tabular-nums"><span className="text-brandGreen-700 font-semibold">✓{s.correct}</span> <span className="text-red-600 font-semibold">✗{s.wrong}</span></span>
                      <span className="text-teal-700 text-xs">{openId === s.id ? "▲ hide" : "▼ view"}</span>
                    </div>
                  </button>
                  <p className="text-[11px] text-gray-400 mt-1">{fmtDate(s.created_at)}</p>

                  {openId === s.id && (
                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-3">
                      {loadingDetail || !detail ? (
                        <p className="text-sm text-gray-500 text-center py-4">Loading questions…</p>
                      ) : (detail.questions || []).length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-4">No questions recorded for this session.</p>
                      ) : (
                        (detail.questions || []).map((q: any) => (
                          <div key={q.question_number} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <span className="text-xs font-semibold text-gray-400">Q{q.question_number}</span>
                              {q.subcategory && <span className="text-[11px] px-2 py-0.5 rounded-full bg-teal-700/10 text-teal-700 font-semibold">{q.subcategory}</span>}
                              {q.selected_answer && (
                                <span className={"text-[11px] px-2 py-0.5 rounded-full font-semibold " + (q.is_correct ? "bg-brandGreen/15 text-brandGreen-700" : "bg-red-50 text-red-700")}>
                                  {q.is_correct ? "✓ answered correctly" : "✗ answered wrong"}
                                </span>
                              )}
                              {!q.selected_answer && <span className="text-[11px] text-gray-400">not answered</span>}
                            </div>
                            <p className="font-medium text-navy-900 text-sm mb-2">{q.question_text}</p>
                            <div className="space-y-1">
                              {(["A","B","C","D"] as const).map((L) => {
                                const correct = q.correct_answer === L;
                                const chosen = q.selected_answer === L;
                                return (
                                  <div key={L} className={"text-sm px-2 py-1 rounded " + (correct ? "bg-brandGreen/10 text-brandGreen-700 font-medium" : chosen ? "bg-red-50 text-red-700" : "text-gray-600")}>
                                    <span className="font-semibold mr-1">{L}.</span>{q.answers[L]}
                                    {correct && <span className="ml-2 text-xs">✓ correct</span>}
                                  </div>
                                );
                              })}
                            </div>
                            {q.explanation && <p className="text-xs text-gray-600 mt-2"><span className="font-semibold">Why: </span>{q.explanation}</p>}
                            {q.sources?.length > 0 && (
                              <div className="text-xs mt-1">
                                {q.sources.map((src: any, i: number) => (
                                  src.url ? <a key={i} href={src.url} target="_blank" rel="noopener noreferrer" className="text-teal-700 hover:underline mr-2">🔗 {src.title}</a>
                                          : <span key={i} className="text-gray-500 mr-2">{src.title}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
