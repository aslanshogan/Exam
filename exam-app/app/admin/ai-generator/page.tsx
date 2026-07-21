"use client";

import { useEffect, useState } from "react";
import Header from "@/components/Header";
import AdminSidebar from "@/components/AdminSidebar";
import { apiFetch } from "@/lib/apiFetch";
import { TRAINER_TOPIC_GROUPS } from "@/lib/trainerTopics";

/**
 * Admin → AI Question Generator (v4.14)
 * - Web-search-grounded generation with REAL source URLs.
 * - Count options 5/10/20/50 — big batches run as several internal AI
 *   calls (5 per call) with live progress, to stay inside serverless
 *   time limits.
 * - Every generated question is FULLY EDITABLE before import: text,
 *   answers, correct letter, explanation, category, subcategory,
 *   difficulty, written source URLs, and video links (add/edit/remove).
 * - Import saves source_type='internet', sources, video_sources,
 *   ai_generated=true, subcategory, difficulty into the question bank.
 */

type Src = { title: string; url: string };
type Vid = { title: string; url: string; platform: string; reason: string };
type EditQ = {
  include: boolean;
  category_id: string;
  question_text: string;
  answer_a: string; answer_b: string; answer_c: string; answer_d: string;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty: string;
  subcategory: string;
  sources: Src[];
  video_sources: Vid[];
};

const COUNTS = [5, 10, 20, 50];
const CHUNK = 5;

export default function AiGeneratorPage() {
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [topicGroups, setTopicGroups] = useState<{ group: string; topics: string[] }[]>(TRAINER_TOPIC_GROUPS as any);
  const [topic, setTopic] = useState("");
  const [customTopic, setCustomTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState(5);
  const [generating, setGenerating] = useState(false);
  const [savingDirect, setSavingDirect] = useState(false);
  const [directCategory, setDirectCategory] = useState("");
  const [requireVideo, setRequireVideo] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<EditQ[]>([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/admin/categories").then(({ ok, data }) => {
      if (ok && data) {
        const cats = (data.rules || []).map((r: any) => ({ id: r.category_id, name: r.categories?.name }));
        setCategories(cats);
      }
    });
    apiFetch("/api/trainer/topics").then(({ ok, data }) => {
      if (ok && data?.groups?.length) setTopicGroups(data.groups);
    });
  }, []);

  const chosenTopic = topic === "__custom__" ? customTopic.trim() : topic;
  const defaultCategoryId = categories[0]?.id || "";

  async function generate() {
    if (!chosenTopic) { setError("Choose a topic (or type a custom one)."); return; }
    setGenerating(true);
    setError(null);
    setMessage(null);
    setResults([]);

    const collected: EditQ[] = [];
    let remaining = count;
    let chunkNo = 0;
    const totalChunks = Math.ceil(count / CHUNK);

    // Internal batching: one AI call per chunk, sequential, with live
    // progress. Stops on the first hard error but keeps what it has.
    while (remaining > 0) {
      chunkNo++;
      setProgress(`Generating… batch ${chunkNo} of ${totalChunks} (${collected.length}/${count} done). Each batch searches the web — 20–60s.`);
      const ask = Math.min(CHUNK, remaining);
      const { ok, data, error } = await apiFetch("/api/admin/ai-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: chosenTopic, difficulty, count: ask, requireVideo }),
      });
      if (!ok || !data) {
        setError(
          (error || "Generation failed.") +
            (collected.length > 0 ? ` Keeping the ${collected.length} question(s) already generated.` : "")
        );
        break;
      }
      for (const q of data.questions || []) {
        collected.push({
          include: true,
          category_id: defaultCategoryId,
          question_text: q.question_text,
          answer_a: q.answer_a, answer_b: q.answer_b, answer_c: q.answer_c, answer_d: q.answer_d,
          correct_answer: q.correct_answer,
          explanation: q.explanation || "",
          difficulty: q.difficulty || (difficulty === "mixed" ? "medium" : difficulty),
          subcategory: q.subcategory || "",
          sources: q.sources || [],
          video_sources: q.video_sources || [],
        });
      }
      setResults([...collected]);
      remaining = count - collected.length;
      if ((data.questions || []).length === 0) break; // avoid spinning on empty batches
    }

    setProgress(null);
    setGenerating(false);
    if (collected.length > 0 && collected.length < count) {
      setMessage(`Produced ${collected.length} of ${count} — you can Generate again to top up.`);
    }
  }

  async function generateAndSave() {
    if (!chosenTopic) { setError("Choose a topic (or type a custom one)."); return; }
    setSavingDirect(true);
    setError(null);
    setMessage(null);
    setResults([]);

    let saved = 0, withVideos = 0, skipped = 0, dupes = 0, remaining = count, chunkNo = 0;
    const totalChunks = Math.ceil(count / CHUNK);
    while (remaining > 0) {
      chunkNo++;
      setProgress(`Generating & saving… batch ${chunkNo} of ${totalChunks} (${saved} saved). Each batch searches the web — 20–60s.`);
      const ask = Math.min(CHUNK, remaining);
      const { ok, data, error } = await apiFetch("/api/admin/ai-generator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: chosenTopic, difficulty, count: ask, save: true, requireVideo }),
      });
      if (!ok || !data) {
        setError((error || "Generation failed.") + (saved > 0 ? ` Saved ${saved} so far.` : ""));
        break;
      }
      saved += data.saved || 0;
      withVideos += data.withVideos || 0;
      skipped += data.skippedNoSource || 0;
      dupes += data.duplicatesRemoved || 0;
      remaining -= ask;
    }

    setProgress(null);
    setSavingDirect(false);
    if (saved > 0) {
      setMessage(
        `Saved ${saved} question(s) straight into the bank (${withVideos} with video links` +
          (skipped > 0 ? `, ${skipped} skipped for no verifiable source` : "") +
          (dupes > 0 ? `, ${dupes} duplicate(s) filtered out` : "") +
          `). They're live in Admin → Questions.`
      );
    }
  }

  function upd(i: number, patch: Partial<EditQ>) {
    setResults((rs) => rs.map((q, idx) => (idx === i ? { ...q, ...patch } : q)));
  }
  function updSrc(i: number, j: number, patch: Partial<Src>) {
    setResults((rs) => rs.map((q, idx) => idx !== i ? q : { ...q, sources: q.sources.map((s, sj) => (sj === j ? { ...s, ...patch } : s)) }));
  }
  function updVid(i: number, j: number, patch: Partial<Vid>) {
    setResults((rs) => rs.map((q, idx) => idx !== i ? q : { ...q, video_sources: q.video_sources.map((v, vj) => (vj === j ? { ...v, ...patch } : v)) }));
  }

  const selectedCount = results.filter((q) => q.include).length;

  // ---- Review filters (req 4) ----
  const [fCategory, setFCategory] = useState("");
  const [fSubcategory, setFSubcategory] = useState("");
  const [fDifficulty, setFDifficulty] = useState("");
  const [fSource, setFSource] = useState(""); // "" | "has" | "missing"
  const [fVideo, setFVideo] = useState("");   // "" | "has" | "none"
  const [fSelectedOnly, setFSelectedOnly] = useState(false);

  function matchesFilter(q: EditQ): boolean {
    if (fCategory && q.category_id !== fCategory) return false;
    if (fSubcategory && !q.subcategory.toLowerCase().includes(fSubcategory.toLowerCase())) return false;
    if (fDifficulty && q.difficulty !== fDifficulty) return false;
    const hasSource = q.sources.some((s) => s.title && s.url);
    if (fSource === "has" && !hasSource) return false;
    if (fSource === "missing" && hasSource) return false;
    const hasVideo = q.video_sources.some((v) => v.url);
    if (fVideo === "has" && !hasVideo) return false;
    if (fVideo === "none" && hasVideo) return false;
    if (fSelectedOnly && !q.include) return false;
    return true;
  }
  const subcatOptions = Array.from(new Set(results.map((q) => q.subcategory).filter(Boolean)));
  const visibleCount = results.filter(matchesFilter).length;

  async function importSelected() {
    const picked = results.filter((q) => q.include);
    if (picked.length === 0) { setError("Select at least one question."); return; }
    if (picked.some((q) => q.sources.filter((s) => s.title && s.url).length === 0)) {
      setError("Every selected question needs at least one written source with a URL.");
      return;
    }
    setImporting(true);
    setError(null);
    // Send the topic name; the server ensures a bank category with that
    // name exists and files the questions under it. Your exam categories
    // are never shown or used here.
    const { ok, data, error } = await apiFetch("/api/admin/ai-generator/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions: picked, topic: chosenTopic }),
    });
    setImporting(false);
    if (!ok || !data) { setError(error || "Import failed."); return; }
    setMessage(`Imported ${data.imported} question(s) into "${chosenTopic}" (Admin → Questions).`);
    setResults([]);
  }

  const inputCls = "border rounded-lg px-2 py-1.5 w-full text-sm";

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 flex gap-8">
        <AdminSidebar />
        <div className="flex-1 space-y-6">
          <h1 className="text-2xl font-bold text-navy-900">AI Question Generator</h1>
          <p className="text-sm text-gray-500 -mt-4">
            Generates questions grounded in a real web search, with real source URLs. Review and edit
            everything below, then import into the question bank. (For one-by-one practice use the{" "}
            <a href="/trainer" className="text-teal-700 underline">Knowledge Trainer</a>.)
          </p>

          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-4 py-2">{error}</p>}
          {message && <p className="text-sm text-teal-800 bg-teal-700/10 border border-teal-700/20 rounded-lg px-4 py-2">{message}</p>}

          <div className="card p-5 space-y-3 max-w-2xl">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Topic</label>
              <select value={topic} onChange={(e) => setTopic(e.target.value)} className="border rounded-lg px-3 py-2 w-full">
                <option value="">— choose —</option>
                {topicGroups.map((g) => (
                  <optgroup key={g.group} label={g.group}>
                    {g.topics.map((t) => <option key={t} value={t}>{t}</option>)}
                  </optgroup>
                ))}
                <option value="__custom__">Custom topic…</option>
              </select>
            </div>
            {topic === "__custom__" && (
              <input value={customTopic} onChange={(e) => setCustomTopic(e.target.value)} placeholder="e.g. penstock water hammer protection" className="border rounded-lg px-3 py-2 w-full" />
            )}
            <div className="flex gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Difficulty</label>
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="border rounded-lg px-3 py-2">
                  <option value="easy">easy</option>
                  <option value="medium">medium</option>
                  <option value="hard">hard</option>
                  <option value="mixed">mixed</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">How many</label>
                <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="border rounded-lg px-3 py-2">
                  {COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={requireVideo} onChange={(e) => setRequireVideo(e.target.checked)} />
              Only keep questions that have a real English video link
            </label>
            {requireVideo && (
              <p className="text-[11px] text-amber-700">
                Questions without a found video are discarded, so you'll get fewer per run and it uses more searches. Video language is filtered by title (English); a rare non-English video can still slip through — remove it in review.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={generate} disabled={generating || savingDirect} className="bg-navy-900 text-white font-bold px-5 py-2.5 rounded-lg disabled:opacity-60">
                {generating ? "Generating…" : "⚡ Generate for Review"}
              </button>
              <span className="text-xs text-gray-400">or</span>
              <button
                onClick={generateAndSave}
                disabled={generating || savingDirect || !chosenTopic}
                className="bg-brandGreen text-navy-900 font-bold px-5 py-2.5 rounded-lg disabled:opacity-60"
                title="Generate and save straight into the bank, under a category named after the topic"
              >
                {savingDirect ? "Generating & saving…" : "⚡ Generate & save to bank"}
              </button>
            </div>
            {progress && <p className="text-xs text-gray-500 animate-pulse">{progress}</p>}
            <p className="text-[11px] text-gray-400">
              "Generate for Review" lets you edit before importing. "Generate &amp; save to bank" skips review and saves
              questions (with their verified sources + video links) into a bank category named after the topic
              (e.g. topic "Francis Turbine" → saved under "Francis Turbine"). Your exam categories aren't touched.
            </p>
            {count >= 20 && !generating && (
              <p className="text-xs text-gray-400">Large batches run as several web-searched AI calls — {Math.ceil(count / CHUNK)} batches for {count} questions, expect a few minutes.</p>
            )}
          </div>

          {results.length > 0 && (
            <>
              <div className="card p-4 flex flex-wrap items-center gap-3 sticky top-0 z-10">
                <span className="text-sm font-semibold text-navy-900">{selectedCount} of {results.length} selected</span>
                <button onClick={importSelected} disabled={importing} className="bg-brandGreen text-navy-900 font-bold px-4 py-2 rounded-lg disabled:opacity-60">
                  {importing ? "Importing..." : "⬇ Import selected (with sources)"}
                </button>
              </div>

              <div className="card p-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Subcategory</label>
                  <select value={fSubcategory} onChange={(e) => setFSubcategory(e.target.value)} className="border rounded-lg px-2 py-1 text-xs">
                    <option value="">all</option>
                    {subcatOptions.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Difficulty</label>
                  <select value={fDifficulty} onChange={(e) => setFDifficulty(e.target.value)} className="border rounded-lg px-2 py-1 text-xs">
                    <option value="">all</option>
                    <option value="easy">easy</option>
                    <option value="medium">medium</option>
                    <option value="hard">hard</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Written source</label>
                  <select value={fSource} onChange={(e) => setFSource(e.target.value)} className="border rounded-lg px-2 py-1 text-xs">
                    <option value="">all</option>
                    <option value="has">has source</option>
                    <option value="missing">missing source</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Video</label>
                  <select value={fVideo} onChange={(e) => setFVideo(e.target.value)} className="border rounded-lg px-2 py-1 text-xs">
                    <option value="">all</option>
                    <option value="has">has video</option>
                    <option value="none">no video</option>
                  </select>
                </div>
                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={fSelectedOnly} onChange={(e) => setFSelectedOnly(e.target.checked)} />
                  selected only
                </label>
                {(fCategory || fSubcategory || fDifficulty || fSource || fVideo || fSelectedOnly) && (
                  <button
                    onClick={() => { setFCategory(""); setFSubcategory(""); setFDifficulty(""); setFSource(""); setFVideo(""); setFSelectedOnly(false); }}
                    className="text-xs text-gray-500 hover:underline ml-auto"
                  >
                    clear filters
                  </button>
                )}
                <span className="text-[11px] text-gray-400 w-full">Showing {visibleCount} of {results.length}.</span>
              </div>

              <div className="space-y-5">
                {results.map((q, i) => {
                  if (!matchesFilter(q)) return null;
                  return (
                  <div key={i} className={"card p-5 space-y-3 " + (q.include ? "" : "opacity-50")}>
                    <div className="flex items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm font-semibold text-navy-900 cursor-pointer">
                        <input type="checkbox" checked={q.include} onChange={(e) => upd(i, { include: e.target.checked })} />
                        Question {i + 1}
                      </label>
                      <div className="flex items-center gap-2">
                        <input value={q.subcategory} onChange={(e) => upd(i, { subcategory: e.target.value })} placeholder="subcategory" className="border rounded-lg px-2 py-1 text-xs w-32" />
                        <select value={q.difficulty} onChange={(e) => upd(i, { difficulty: e.target.value })} className="border rounded-lg px-2 py-1 text-xs">
                          <option value="easy">easy</option>
                          <option value="medium">medium</option>
                          <option value="hard">hard</option>
                        </select>
                      </div>
                    </div>

                    <textarea value={q.question_text} onChange={(e) => upd(i, { question_text: e.target.value })} rows={2} className={inputCls} />

                    <div className="grid sm:grid-cols-2 gap-2">
                      {(["A", "B", "C", "D"] as const).map((L) => (
                        <div key={L} className="flex items-center gap-2">
                          <button
                            onClick={() => upd(i, { correct_answer: L })}
                            title="Mark as correct"
                            className={"w-7 h-7 rounded-full text-xs font-bold border shrink-0 " + (q.correct_answer === L ? "bg-brandGreen text-navy-900 border-brandGreen" : "bg-white text-gray-400 border-gray-300")}
                          >
                            {L}
                          </button>
                          <input
                            value={(q as any)[`answer_${L.toLowerCase()}`]}
                            onChange={(e) => upd(i, { [`answer_${L.toLowerCase()}`]: e.target.value } as any)}
                            className={inputCls}
                          />
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 -mt-1">Tap a letter circle to change which answer is correct (green = correct).</p>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Explanation</label>
                      <textarea value={q.explanation} onChange={(e) => upd(i, { explanation: e.target.value })} rows={2} className={inputCls} />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Written sources (URL required)</label>
                      {q.sources.map((s, j) => (
                        <div key={j} className="flex gap-2 mb-1">
                          <input value={s.title} onChange={(e) => updSrc(i, j, { title: e.target.value })} placeholder="title" className={inputCls} />
                          <input value={s.url} onChange={(e) => updSrc(i, j, { url: e.target.value })} placeholder="https://…" className={inputCls} />
                          <button onClick={() => upd(i, { sources: q.sources.filter((_, sj) => sj !== j) })} className="text-red-600 text-xs shrink-0">✕</button>
                        </div>
                      ))}
                      <button onClick={() => upd(i, { sources: [...q.sources, { title: "", url: "" }] })} className="text-xs text-teal-700 hover:underline">+ add source</button>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase text-gray-400 mb-1">Video links (optional — remove any you don't trust)</label>
                      {q.video_sources.length === 0 && <p className="text-xs text-gray-400 mb-1">No real video found for this one — that's fine.</p>}
                      {q.video_sources.map((v, j) => (
                        <div key={j} className="border border-gray-200 rounded-lg p-2 mb-2 space-y-1">
                          <div className="flex gap-2">
                            <input value={v.title} onChange={(e) => updVid(i, j, { title: e.target.value })} placeholder="video title" className={inputCls} />
                            <input value={v.platform} onChange={(e) => updVid(i, j, { platform: e.target.value })} placeholder="platform" className="border rounded-lg px-2 py-1.5 w-28 text-sm" />
                            <button onClick={() => upd(i, { video_sources: q.video_sources.filter((_, vj) => vj !== j) })} className="text-red-600 text-xs shrink-0">✕ remove</button>
                          </div>
                          <input value={v.url} onChange={(e) => updVid(i, j, { url: e.target.value })} placeholder="https://youtube.com/watch?v=…" className={inputCls} />
                          <input value={v.reason} onChange={(e) => updVid(i, j, { reason: e.target.value })} placeholder="why this video helps" className={inputCls} />
                          {v.url && <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-xs text-teal-700 hover:underline">▶ open &amp; check this link</a>}
                        </div>
                      ))}
                      <button onClick={() => upd(i, { video_sources: [...q.video_sources, { title: "", url: "", platform: "YouTube", reason: "" }] })} className="text-xs text-teal-700 hover:underline">+ add video</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
