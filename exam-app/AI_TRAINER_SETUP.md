# AI Knowledge Trainer — setup & how it works (v4.14)

## What providers are used? (two FREE tiers)
Two providers, both with free tiers:
1. **Tavily** (web search) — `TAVILY_API_KEY`. Performs the real
   internet search and returns real result URLs. These form the
   allow-set that every question source is checked against. Free tier is
   ~1,000 searches/month.
2. **Google Gemini** (writing) — `GEMINI_API_KEY`. Writes the questions
   grounded ONLY in the Tavily results we pass it. Generous free daily
   quota.

Because source URLs come from a dedicated search API's structured
results (not model memory), verification is strong: a question's source
URL is accepted only if Tavily actually returned it. The server also
**rejects any question with zero valid written-source URLs**.

## Setup — two one-time steps

### 1. Database (Supabase → SQL Editor) — run once
Run the "v4.13 — AI KNOWLEDGE TRAINER" **and** "v4.14 — REAL INTERNET
SOURCES" blocks at the end of `supabase/schema.sql` (or just re-run the
whole file — everything is guarded and safe to re-run).

### 2. API keys (two free keys)
Get both, then add them locally and in Vercel:
1. **Tavily** — https://tavily.com → sign up → copy the API key
   (starts `tvly-`).
2. **Gemini** — https://aistudio.google.com/apikey → Create API key →
   copy it.

**Locally** in `.env.local`:
```
TAVILY_API_KEY=tvly-...
GEMINI_API_KEY=...
```
**Vercel** → Settings → Environment Variables → add BOTH
`TAVILY_API_KEY` and `GEMINI_API_KEY` (tick Production) → **Redeploy**.

Optional: `GEMINI_MODEL` (default `gemini-2.0-flash`).

Cost: both run on free tiers — no payment method required to start.
Watch the free quotas (Tavily ~1,000 searches/month; Gemini has a
generous daily limit). Each generated question uses one Tavily search
and one Gemini call. If a key is missing, the trainer/generator show a
clear "not configured" message; the rest of the app is unaffected.

## How real written sources work (server-enforced)
Each question stores `sources` as structured JSON:
`[{"title":"...","url":"https://..."}]`. Enforced IN CODE, not just by
the prompt:
- **Proof of real search.** After each generation the server harvests
  the URLs Claude actually returned from its `web_search` tool results
  and citation blocks into an allow-set. A question's source URL is
  accepted ONLY if it matches one of those actually-searched URLs
  (compared host+path, ignoring http/https, `www.`, trailing slashes and
  query params). URLs that merely "look valid" but never appeared in the
  search results are rejected. If a generation returns no real search
  results at all, the whole batch is rejected with a clear message.
- **At least one required.** A question with zero verified source URLs
  is dropped during generation.
- **Admin import re-checks on the server.** Even if someone bypassed the
  review screen, `POST /api/admin/ai-generator/import` rejects (HTTP 400,
  naming the question number) any selected question that has no valid
  written-source URL. Nothing is ever imported with `sources = null`.

In the trainer these render as clickable links; in the admin generator
they're fully editable before import.

## How video links work — and when they're unavailable
`video_sources` is an **optional** array:
`[{"title","url","platform","reason"}]`, validated in code both at
generation and at admin import:
- included ONLY when the web search surfaced a specific video page whose
  URL is in the searched-URL allow-set;
- the URL must be on a real video platform (YouTube/Vimeo) — a
  search-results page, `/channel/…`, or `/@handle` page is rejected as a
  "real video";
- invalid video entries are dropped; **an empty list never blocks a
  question.** When empty, the trainer shows a plain "Find explainer
  videos on YouTube" *search* link (a real search, never a fabricated
  video URL).
Admins can open, edit, or remove every video link during review.

## The trainer flow (unchanged from v4.13)
Enter → pick topic (17 predefined technical topics, your exam
categories, or a custom topic) + difficulty (easy/medium/hard/**mixed**)
or **Continue Last Session** → first question appears → answer A–D →
see correct/wrong, correct answer, explanation, **real source links**,
**real video links when available**, category, subcategory, difficulty →
**Next Question** → forever until you Exit. No Generate button; a
question is generated only on your click; progress and score are saved
after every answer.

## Admin → AI Question Generator
Pick topic + difficulty (incl. mixed) + count (**5/10/20/50** — big
counts run as several internal AI calls with live progress). Every
question is fully editable before import (text, answers, correct letter,
explanation, category, subcategory, difficulty, source URLs, video
links). Import writes to the question bank with
`source_type='internet'`, `sources`, `video_sources`,
`ai_generated=true`, `subcategory`, `difficulty`.
