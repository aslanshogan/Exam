/**
 * lib/aiTrainer.ts — AI question generation with REAL web sources
 * ---------------------------------------------------------------------
 * Server-only. TWO free-tier providers:
 *   1. TAVILY (web search) — TAVILY_API_KEY. Returns real result URLs;
 *      these form the allow-set that every source URL is checked against.
 *   2. GOOGLE GEMINI (writing) — GEMINI_API_KEY. Writes the questions
 *      grounded ONLY in the Tavily search results we pass it.
 *
 * Because the URLs come from a dedicated search API's structured results
 * (not the model's memory), source verification is strong: a question's
 * source URL is accepted only if it was actually returned by Tavily.
 *
 * Guarantees enforced here (not just prompted):
 *  - every accepted question has >= 1 written-source URL that appeared
 *    in the real Tavily results
 *  - video_sources are OPTIONAL; entries must be real video-platform
 *    URLs (YouTube/Vimeo) AND appear in the results, else dropped
 *  - per-question difficulty is stored (supports "mixed")
 *  - answer-letter positions are re-shuffled server-side
 *
 * Generation happens ONLY when a route calls this — i.e. only on an
 * explicit user action. No loops, no polling, no schedulers.
 */

export type SourceLink = { title: string; url: string };
export type VideoSource = { title: string; url: string; platform: string; reason: string };

export type GeneratedQuestion = {
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  subcategory: string;
  sources: SourceLink[];        // REQUIRED real URLs (>=1)
  video_sources: VideoSource[]; // optional, may be []
  video_search: string;         // fallback YouTube SEARCH phrase (not a URL)
};

const TAVILY_URL = "https://api.tavily.com/search";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_URL = (model: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"];

type SearchResult = { title: string; url: string; content: string };

function buildPrompt(
  category: string,
  difficulty: string,
  count: number,
  avoid: string[],
  results: SearchResult[]
): string {
  const avoidBlock =
    avoid.length > 0
      ? `\n\nAlready asked in this session — every new question MUST cover a different fact (no repeats or trivial rephrasings):\n${avoid
          .map((q, i) => `${i + 1}. ${q}`)
          .join("\n")}`
      : "";

  const difficultyLine =
    difficulty === "mixed"
      ? `Difficulty: MIXED — assign each question its own difficulty ("easy", "medium" or "hard"), roughly balanced across the set, and report it in the "difficulty" field.`
      : `Difficulty: ${difficulty} — set "difficulty":"${difficulty}" on every question.`;

  // The exact search results (title, URL, snippet) the questions must be
  // grounded in. Gemini may ONLY use URLs from this list as sources.
  const resultsBlock = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\nExcerpt: ${(r.content || "").slice(0, 500)}`)
    .join("\n\n");

  return `You are an expert instructor writing training questions for POWER PLANT OPERATORS (hydro and general generation).

You are given REAL web search results about "${category}". Write ${count} American-style multiple-choice question${count > 1 ? "s" : ""} grounded ONLY in what these results say.
${difficultyLine}

=== SEARCH RESULTS (the ONLY sources you may cite) ===
${resultsBlock}
=== END SEARCH RESULTS ===

Hard rules:
- Base every question on the search results above. Do NOT use outside knowledge for the facts.
- Exactly 4 options (A–D), exactly one correct; distractors plausible but clearly wrong to a knowledgeable operator; vary the correct letter.
- "explanation": 2–4 sentences teaching WHY the correct answer is right and the others wrong.
- "subcategory": a short (1–4 word) specific sub-topic of "${category}".
- "sources": 1–3 items as {"title":"...","url":"..."}. Each URL MUST be copied EXACTLY from a "URL:" line in the SEARCH RESULTS above. NEVER invent, guess, shorten, or modify a URL, and never cite a URL that is not in the list. Every question needs at least one.
- "video_sources": ONLY if one of the SEARCH RESULTS above is a real YouTube or Vimeo VIDEO page. Then {"title","url","platform","reason"} with the URL copied exactly. The video should be in ENGLISH (English title and, as far as can be told, English narration) — do not pick videos whose titles are in Hindi or another language. Otherwise []. Never invent a video link or use a channel/search page.
- "video_search": a short 3–7 word YouTube search phrase (a phrase, never a URL) — fallback only.${avoidBlock}

Respond with ONLY a JSON array (no markdown fences, no commentary), each element exactly:
{"question_text":"...","answer_a":"...","answer_b":"...","answer_c":"...","answer_d":"...","correct_answer":"A","explanation":"...","difficulty":"medium","subcategory":"...","sources":[{"title":"...","url":"..."}],"video_sources":[],"video_search":"..."}`;
}

function shuffleOptions(q: GeneratedQuestion): GeneratedQuestion {
  const letters = ["A", "B", "C", "D"] as const;
  const opts = [q.answer_a, q.answer_b, q.answer_c, q.answer_d];
  const correctText = opts[letters.indexOf(q.correct_answer)];
  for (let i = opts.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [opts[i], opts[j]] = [opts[j], opts[i]];
  }
  const newCorrect = letters[opts.indexOf(correctText)];
  return { ...q, answer_a: opts[0], answer_b: opts[1], answer_c: opts[2], answer_d: opts[3], correct_answer: newCorrect };
}

/**
 * Normalize question text for duplicate detection: lowercase, strip
 * punctuation, collapse whitespace. Two questions that differ only by
 * wording/punctuation will normalize to the same (or very similar)
 * string so we can catch near-duplicates, not just exact matches.
 */
export function normalizeQuestionText(t: string): string {
  return (t || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Word-overlap (Jaccard) similarity of two normalized strings, 0..1. */
function similarity(a: string, b: string): number {
  const wa = new Set(a.split(" ").filter(Boolean));
  const wb = new Set(b.split(" ").filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return 0;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter);
}

/**
 * Drop questions that duplicate each other or any text in `existing`.
 * A question is a duplicate if its normalized text exactly matches, or
 * its word-overlap similarity with an existing/kept question is >= 0.8.
 */
export function dedupeQuestions(
  questions: GeneratedQuestion[],
  existing: string[]
): { kept: GeneratedQuestion[]; removed: number } {
  const existingNorm = existing.map(normalizeQuestionText);
  const keptNorm: string[] = [];
  const kept: GeneratedQuestion[] = [];
  let removed = 0;

  for (const q of questions) {
    const n = normalizeQuestionText(q.question_text);
    if (!n) { removed++; continue; }
    const clash =
      existingNorm.some((e) => e === n || similarity(e, n) >= 0.8) ||
      keptNorm.some((e) => e === n || similarity(e, n) >= 0.8);
    if (clash) { removed++; continue; }
    keptNorm.push(n);
    kept.push(q);
  }
  return { kept, removed };
}

function validUrl(u: any): string | null {
  if (typeof u !== "string") return null;
  const s = u.trim();
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname.includes(".")) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Normalize a URL for comparison: lowercase host, drop protocol, "www.",
 * trailing slashes, and query/fragment. This lets a source URL the model
 * wrote match the same page in the search results even if it differs by
 * http/https, a trailing slash, or tracking params.
 */
function normalizeUrl(u: string): string | null {
  try {
    const p = new URL(u.trim());
    let host = p.hostname.toLowerCase();
    if (host.startsWith("www.")) host = host.slice(4);
    let path = p.pathname.replace(/\/+$/, "");
    return host + path;
  } catch {
    return null;
  }
}

/**
 * Run a Tavily web search. Returns the real results and a normalized
 * allow-set of their URLs, which every question source is checked
 * against. Tavily's free tier returns clean result URLs + snippets.
 */
async function tavilySearch(query: string): Promise<{ results: SearchResult[]; allowed: Set<string>; error?: string }> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    return {
      results: [],
      allowed: new Set(),
      error:
        "Web search is not configured. Add TAVILY_API_KEY to your environment variables (free key at tavily.com), then redeploy.",
    };
  }

  let res: Response;
  try {
    res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: "basic",
        max_results: 8,
        include_answer: false,
      }),
    });
  } catch (e: any) {
    return { results: [], allowed: new Set(), error: `Could not reach the search service: ${e?.message || e}` };
  }

  const text = await res.text();
  if (!res.ok) {
    console.error("[aiTrainer] Tavily error:", res.status, text.slice(0, 300));
    return { results: [], allowed: new Set(), error: `Web search failed (HTTP ${res.status}).` };
  }

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { results: [], allowed: new Set(), error: "Search returned an unreadable response." };
  }

  const results: SearchResult[] = (Array.isArray(data.results) ? data.results : [])
    .map((r: any) => ({
      title: typeof r?.title === "string" ? r.title.trim() : "",
      url: validUrl(r?.url) || "",
      content: typeof r?.content === "string" ? r.content : "",
    }))
    .filter((r: SearchResult) => r.url && r.title);

  const allowed = new Set<string>();
  for (const r of results) {
    const n = normalizeUrl(r.url);
    if (n) allowed.add(n);
  }
  return { results, allowed };
}

function cleanSources(raw: any, allowed: Set<string> | null): SourceLink[] {
  if (!Array.isArray(raw)) return [];
  const out: SourceLink[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const url = validUrl(item?.url);
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    if (!url || !title) continue;
    const norm = normalizeUrl(url);
    if (!norm || seen.has(norm)) continue;
    // Proof-of-search: when we have the set of URLs the search actually
    // returned, only accept sources whose URL is in it. (allowed=null
    // means "not available" — e.g. legacy path — and we fall back to
    // structural validation only.)
    if (allowed && !allowed.has(norm)) continue;
    seen.add(norm);
    out.push({ title, url });
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Heuristic English-language check for a video title. We can't know the
 * spoken/audio language from search data, so we filter on the title:
 *  - reject titles containing non-Latin scripts (Devanagari, Arabic,
 *    CJK, Cyrillic, etc.) — this removes most Hindi/regional/foreign
 *    videos whose titles are in their own script;
 *  - require that the title is mostly Latin characters.
 * This catches the common cases; a foreign-language video with a fully
 * English title can still slip through (audio language isn't in the
 * data), so the reviewer removes the rare miss.
 */
function looksEnglishTitle(title: string): boolean {
  if (!title) return false;
  // Any character in these ranges → treat as non-English script.
  const nonLatin = /[\u0900-\u097F\u0600-\u06FF\u0400-\u04FF\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u0E00-\u0E7F]/;
  if (nonLatin.test(title)) return false;
  // Require a reasonable share of ASCII letters (filters odd/garbled titles).
  const letters = (title.match(/[A-Za-z]/g) || []).length;
  return letters >= Math.max(4, Math.floor(title.replace(/\s/g, "").length * 0.5));
}

function cleanVideos(raw: any, allowed: Set<string> | null): VideoSource[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoSource[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const url = validUrl(item?.url);
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    if (!url || !title) continue;
    if (!looksEnglishTitle(title)) continue; // English-title preference
    const norm = normalizeUrl(url);
    if (!norm || seen.has(norm)) continue;
    let host = "";
    try { host = new URL(url).hostname.toLowerCase(); } catch { continue; }
    if (!VIDEO_HOSTS.some((h) => host === h || host.endsWith("." + h))) continue; // real video platforms only
    // Reject obvious non-video pages (search/results/channel listings).
    if (/\/results\?|\/search\?|\/channel\/|\/@[^/]+\/?$/.test(url)) continue;
    // Proof-of-search: a real video must have appeared in search results.
    if (allowed && !allowed.has(norm)) continue;
    seen.add(norm);
    out.push({
      title,
      url,
      platform: host.includes("vimeo") ? "Vimeo" : "YouTube",
      reason: typeof item?.reason === "string" ? item.reason.trim() : "",
    });
    if (out.length >= 3) break;
  }
  return out;
}

function validateQuestion(raw: any, requestedDifficulty: string, allowed: Set<string> | null): GeneratedQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  for (const f of ["question_text", "answer_a", "answer_b", "answer_c", "answer_d", "explanation"]) {
    if (typeof raw[f] !== "string" || raw[f].trim().length === 0) return null;
  }
  const correct = String(raw.correct_answer || "").trim().toUpperCase();
  if (!["A", "B", "C", "D"].includes(correct)) return null;

  const sources = cleanSources(raw.sources, allowed);
  if (sources.length === 0) return null; // written source URLs are REQUIRED, and must be real searched URLs

  let difficulty = String(raw.difficulty || "").trim().toLowerCase();
  if (!["easy", "medium", "hard"].includes(difficulty)) {
    difficulty = ["easy", "medium", "hard"].includes(requestedDifficulty) ? requestedDifficulty : "medium";
  }

  return shuffleOptions({
    question_text: raw.question_text.trim(),
    answer_a: raw.answer_a.trim(),
    answer_b: raw.answer_b.trim(),
    answer_c: raw.answer_c.trim(),
    answer_d: raw.answer_d.trim(),
    correct_answer: correct as "A" | "B" | "C" | "D",
    explanation: raw.explanation.trim(),
    difficulty: difficulty as "easy" | "medium" | "hard",
    subcategory: typeof raw.subcategory === "string" ? raw.subcategory.trim().slice(0, 80) : "",
    sources,
    video_sources: cleanVideos(raw.video_sources, allowed),
    video_search: typeof raw.video_search === "string" ? raw.video_search.trim() : "",
  });
}

async function callOnce(opts: {
  category: string;
  difficulty: string;
  count: number;
  avoid: string[];
}): Promise<{ questions: GeneratedQuestion[]; error?: string }> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) {
    return {
      questions: [],
      error:
        "AI is not configured. Add GEMINI_API_KEY to your environment variables (free key at aistudio.google.com/apikey), then redeploy.",
    };
  }

  // STEP 1 — real web search (Tavily). This produces the results the
  // questions are grounded in AND the allow-set of real source URLs.
  const search = await tavilySearch(
    `${opts.category} power plant operation engineering explained English tutorial`
  );
  if (search.error) return { questions: [], error: search.error };
  if (search.results.length === 0 || search.allowed.size === 0) {
    return { questions: [], error: "The web search returned no usable results this time. Please try again." };
  }

  // STEP 2 — Gemini writes the questions grounded in those results.
  const prompt = buildPrompt(opts.category, opts.difficulty, opts.count, opts.avoid.slice(-15), search.results);

  let res: Response;
  try {
    res = await fetch(`${GEMINI_URL(GEMINI_MODEL)}?key=${encodeURIComponent(geminiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.6,
          maxOutputTokens: Math.min(8192, 1200 + opts.count * 600),
          responseMimeType: "application/json",
        },
      }),
    });
  } catch (e: any) {
    return { questions: [], error: `Could not reach the AI service: ${e?.message || e}` };
  }

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("[aiTrainer] Gemini error:", res.status, bodyText.slice(0, 500));
    let msg = `AI request failed (HTTP ${res.status}).`;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.error?.message) msg = `AI request failed: ${parsed.error.message}`;
    } catch {}
    return { questions: [], error: msg };
  }

  // Gemini returns candidates[].content.parts[].text; with
  // responseMimeType=json that text is the JSON array.
  let text = "";
  try {
    const data = JSON.parse(bodyText);
    const parts = data?.candidates?.[0]?.content?.parts;
    text = Array.isArray(parts) ? parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("") : "";
  } catch {
    return { questions: [], error: "AI returned an unreadable response." };
  }

  text = text.replace(/```json|```/g, "").trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    console.error("[aiTrainer] no JSON array in output:", text.slice(0, 300));
    return { questions: [], error: "AI response was not in the expected format. Please try again." };
  }

  let arr: any[];
  try {
    arr = JSON.parse(text.slice(start, end + 1));
  } catch {
    console.error("[aiTrainer] JSON parse failed:", text.slice(0, 300));
    return { questions: [], error: "AI response could not be parsed. Please try again." };
  }

  // Every source URL is verified against the REAL Tavily result URLs.
  const questions = arr
    .map((raw) => validateQuestion(raw, opts.difficulty, search.allowed))
    .filter((q): q is GeneratedQuestion => q !== null);

  if (questions.length === 0) {
    return {
      questions: [],
      error: "AI produced no questions whose sources matched the real search results. Please try again.",
    };
  }
  return { questions };
}

export async function generateTrainerQuestions(opts: {
  category: string;
  difficulty: string; // easy | medium | hard | mixed
  count: number;      // per-call cap: 10 (bigger batches are chunked by the caller)
  avoid?: string[];
}): Promise<{ questions: GeneratedQuestion[]; error?: string }> {
  const count = Math.max(1, Math.min(10, opts.count));
  const first = await callOnce({ category: opts.category, difficulty: opts.difficulty, count, avoid: opts.avoid || [] });
  if (first.questions.length > 0) return first;
  // One automatic retry on a bad/empty response (models occasionally
  // return malformed JSON) — still bounded, never a loop.
  const second = await callOnce({ category: opts.category, difficulty: opts.difficulty, count, avoid: opts.avoid || [] });
  return second.questions.length > 0 ? second : { questions: [], error: second.error || first.error };
}

export function isValidHttpUrl(u: any): string | null {
  return validUrl(u);
}

/** Strict single-video validator shared with the admin import route. */
export function validateVideoLink(v: any): VideoSource | null {
  const url = validUrl(v?.url);
  const title = typeof v?.title === "string" ? v.title.trim() : "";
  if (!url || !title) return null;
  if (!looksEnglishTitle(title)) return null; // English-title preference
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return null; }
  const VH = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"];
  if (!VH.some((h) => host === h || host.endsWith("." + h))) return null;
  if (/\/results\?|\/search\?|\/channel\/|\/@[^/]+\/?$/.test(url)) return null;
  return {
    title,
    url,
    platform: host.includes("vimeo") ? "Vimeo" : "YouTube",
    reason: typeof v?.reason === "string" ? v.reason.trim() : "",
  };
}

/** Maps a generated question to a trainer_questions row (new structured
 *  columns + legacy text columns kept in sync for compatibility). */
export function trainerQuestionRow(sessionId: string, questionNumber: number, category: string, q: GeneratedQuestion) {
  return {
    session_id: sessionId,
    question_number: questionNumber,
    question_text: q.question_text,
    answer_a: q.answer_a,
    answer_b: q.answer_b,
    answer_c: q.answer_c,
    answer_d: q.answer_d,
    correct_answer: q.correct_answer,
    explanation: q.explanation,
    // legacy text columns (kept for compatibility)
    sources: q.sources.map((s) => `${s.title} — ${s.url}`).join("\n"),
    video_search: q.video_search,
    // structured columns (v4.14)
    category,
    subcategory: q.subcategory || null,
    difficulty: q.difficulty,
    sources_json: q.sources,
    video_sources: q.video_sources,
    source_type: "internet",
    ai_generated: true,
  };
}
