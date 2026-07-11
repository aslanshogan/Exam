/**
 * lib/aiTrainer.ts — AI question generation with REAL web sources
 * ---------------------------------------------------------------------
 * Server-only. Calls the Anthropic Messages API with the built-in
 * **web_search tool enabled**, so the model actually searches the public
 * internet first and must cite URLs taken from its real search results.
 * One provider, one key: ANTHROPIC_API_KEY. (Web search is billed by
 * Anthropic as a small extra per-search fee on top of tokens.)
 *
 * Guarantees enforced here (not just prompted):
 *  - every accepted question has >= 1 valid https written-source URL
 *  - video_sources are OPTIONAL; entries must be real video-platform
 *    URLs (YouTube/Vimeo hosts) or they are dropped; an empty list never
 *    blocks generation
 *  - per-question difficulty is stored (supports "mixed")
 *  - answer-letter positions are re-shuffled server-side
 *
 * Generation still happens ONLY when a route calls this — i.e. only on
 * an explicit user action. No loops, no polling, no schedulers.
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

const API_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";
const VIDEO_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "vimeo.com", "www.vimeo.com"];

function buildPrompt(category: string, difficulty: string, count: number, avoid: string[]): string {
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

  return `You are an expert instructor writing training questions for POWER PLANT OPERATORS (hydro and general generation).

STEP 1 — RESEARCH (mandatory): use the web_search tool to find authoritative PUBLIC sources about "${category}" (engineering references, manufacturer/utility documentation, standards summaries, reputable educational sites, and — if genuinely found — explainer video pages on YouTube or Vimeo). Perform 2–4 searches before writing anything.

STEP 2 — WRITE ${count} American-style multiple-choice question${count > 1 ? "s" : ""} on "${category}", grounded in what the search results actually say.
${difficultyLine}

Hard rules:
- Exactly 4 options (A–D), exactly one correct; distractors plausible but clearly wrong to a knowledgeable operator; vary the correct letter.
- "explanation": 2–4 sentences teaching WHY the correct answer is right and the others wrong.
- "subcategory": a short (1–4 word) specific sub-topic of "${category}" this question covers.
- "sources": 1–3 written sources as {"title":"...","url":"https://..."}. URLs MUST be copied EXACTLY from your web_search results. NEVER construct, guess, shorten, or modify a URL. Every question needs at least one.
- "video_sources": ONLY if your search results actually contained a specific video page (a YouTube watch/short URL or Vimeo video URL). Then include {"title","url","platform","reason"} with the URL copied exactly from results. If no real video page appeared in results, use []. Do NOT invent video links, and do NOT put a channel/search page here.
- "video_search": a short 3–7 word YouTube search phrase for this concept (a phrase, never a URL) — used only as a fallback when video_sources is empty.${avoidBlock}

FINAL OUTPUT: after your research, respond with ONLY a JSON array (no markdown fences, no commentary before or after), each element exactly:
{"question_text":"...","answer_a":"...","answer_b":"...","answer_c":"...","answer_d":"...","correct_answer":"A","explanation":"...","difficulty":"medium","subcategory":"...","sources":[{"title":"...","url":"https://..."}],"video_sources":[],"video_search":"..."}`;
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
 * Harvest the URLs that Anthropic ACTUALLY returned from the web_search
 * tool + any citation blocks, so we can prove a question's sources came
 * from real search results (not model memory). We walk the whole content
 * array defensively, since block shapes can nest.
 */
function collectSearchedUrls(content: any[]): Set<string> {
  const urls = new Set<string>();
  const add = (u: any) => {
    const v = validUrl(u);
    if (!v) return;
    const n = normalizeUrl(v);
    if (n) urls.add(n);
  };

  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== "object") return;

    // web_search_tool_result blocks: { type, content: [{ url, title }] }
    if (node.type === "web_search_tool_result" && Array.isArray(node.content)) {
      for (const r of node.content) if (r && typeof r.url === "string") add(r.url);
    }
    // Some SDKs expose results under .results
    if (Array.isArray(node.results)) {
      for (const r of node.results) if (r && typeof r.url === "string") add(r.url);
    }
    // citation blocks on text: { citations: [{ url }] }
    if (Array.isArray(node.citations)) {
      for (const c of node.citations) if (c && typeof c.url === "string") add(c.url);
    }
    // Direct url on any block we happened to hit.
    if (typeof node.url === "string") add(node.url);

    // Recurse into common nested holders.
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };

  walk(content);
  return urls;
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

function cleanVideos(raw: any, allowed: Set<string> | null): VideoSource[] {
  if (!Array.isArray(raw)) return [];
  const out: VideoSource[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const url = validUrl(item?.url);
    const title = typeof item?.title === "string" ? item.title.trim() : "";
    if (!url || !title) continue;
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
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      questions: [],
      error:
        "AI is not configured. Add ANTHROPIC_API_KEY to your environment variables (get a key at console.anthropic.com), then redeploy.",
    };
  }

  const prompt = buildPrompt(opts.category, opts.difficulty, opts.count, opts.avoid.slice(-15));

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.AI_MODEL || DEFAULT_MODEL,
        max_tokens: Math.min(16000, 1500 + opts.count * 700),
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }],
        messages: [{ role: "user", content: prompt }],
      }),
    });
  } catch (e: any) {
    return { questions: [], error: `Could not reach the AI service: ${e?.message || e}` };
  }

  const bodyText = await res.text();
  if (!res.ok) {
    console.error("[aiTrainer] API error:", res.status, bodyText.slice(0, 500));
    let msg = `AI request failed (HTTP ${res.status}).`;
    try {
      const parsed = JSON.parse(bodyText);
      if (parsed?.error?.message) msg = `AI request failed: ${parsed.error.message}`;
    } catch {}
    return { questions: [], error: msg };
  }

  // The response contains text blocks interleaved with web-search tool
  // blocks; only the text blocks carry the final JSON.
  let content: any[] = [];
  let text = "";
  try {
    const data = JSON.parse(bodyText);
    content = Array.isArray(data.content) ? data.content : [];
    text = content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
  } catch {
    return { questions: [], error: "AI returned an unreadable response." };
  }

  // Prove-real-sources: collect the URLs the web_search tool + citations
  // actually returned. If the model never searched (empty set), we cannot
  // verify sources, so we reject the batch rather than trust model memory.
  const allowedSourceUrls = collectSearchedUrls(content);
  if (allowedSourceUrls.size === 0) {
    console.error("[aiTrainer] no web_search result URLs in response — refusing to trust model-memory sources.");
    return {
      questions: [],
      error:
        "The AI did not return real web-search results this time (so sources can't be verified). Please try again; if it persists, set AI_MODEL=claude-sonnet-4-6.",
    };
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

  const questions = arr
    .map((raw) => validateQuestion(raw, opts.difficulty, allowedSourceUrls))
    .filter((q): q is GeneratedQuestion => q !== null);

  if (questions.length === 0) {
    return {
      questions: [],
      error:
        "AI produced no questions whose sources matched real web-search results. Please try again.",
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
