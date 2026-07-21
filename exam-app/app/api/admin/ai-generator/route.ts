import { NextRequest, NextResponse } from "next/server";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { generateTrainerQuestions, dedupeQuestions } from "@/lib/aiTrainer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAudit } from "@/lib/auditLog";

// Web-search-grounded generation: allow up to 60s per call. Bigger
// batches (20/50) are chunked into multiple calls by the admin UI.
export const maxDuration = 60;

/**
 * POST /api/admin/ai-generator
 * body: { category, difficulty, count, save?, category_id? }
 *
 * Default (save not true): generates a BATCH for admin review; nothing
 * is saved — the admin edits and imports via /import.
 *
 * save:true  → "Generate and save straight to the bank": after
 * generating, the questions are written directly into the questions
 * table WITH their verified sources, video links, and metadata
 * (source_type='internet', ai_generated=true, subcategory, difficulty),
 * using the same source-required rule as the import route. Requires
 * category_id (which bank category to file them under). Returns how many
 * were saved and any that were skipped for missing a valid source.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => ({}));
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 120) : "";
  const difficulty = ["easy", "medium", "hard", "mixed"].includes(body.difficulty) ? body.difficulty : "medium";
  const count = Math.max(1, Math.min(10, Number(body.count) || 5)); // per-call cap; UI chunks 20/50
  const save = body.save === true;
  const requireVideo = body.requireVideo === true;
  const categoryId = typeof body.category_id === "string" ? body.category_id : "";
  if (!category) return NextResponse.json({ error: "category is required." }, { status: 400 });
  if (save && !categoryId) {
    return NextResponse.json({ error: "category_id is required when saving directly to the bank." }, { status: 400 });
  }

  const gen = await generateTrainerQuestions({ category, difficulty, count, avoid: await recentTexts(categoryId, category) });
  if (gen.error && gen.questions.length === 0) {
    return NextResponse.json({ error: gen.error }, { status: 502 });
  }

  // Remove any near-duplicates against what's already in the bank (and
  // within this batch), so generating repeatedly won't create doubles.
  const existingTexts = await existingQuestionTexts(categoryId, category);
  let { kept, removed } = dedupeQuestions(gen.questions, existingTexts);

  // Optional: keep ONLY questions that have a real (English) video link.
  let droppedNoVideo = 0;
  if (requireVideo) {
    const before = kept.length;
    kept = kept.filter((q) => Array.isArray(q.video_sources) && q.video_sources.length > 0);
    droppedNoVideo = before - kept.length;
  }

  if (kept.length === 0) {
    const why = requireVideo
      ? "No questions with a real English video were found this time. Try again, or turn off 'videos required'."
      : "Only duplicate questions were produced this time. Try again or a different topic/difficulty.";
    return NextResponse.json({ error: why, duplicatesRemoved: removed, droppedNoVideo }, { status: 200 });
  }

  // Review mode: just return the (deduped/filtered) generated questions.
  if (!save) {
    return NextResponse.json({ questions: kept, requested: count, produced: kept.length, duplicatesRemoved: removed, droppedNoVideo });
  }

  // Save-direct mode: insert straight into the bank. Sources are already
  // verified real (searched) by the generator; we still require >=1 and
  // keep only strictly-valid videos, mirroring the import route.
  const rows = [];
  let skippedNoSource = 0;
  for (const q of kept) {
    const sources = (q.sources || []).filter((s) => s && s.title && s.url);
    if (sources.length === 0) { skippedNoSource++; continue; }
    rows.push({
      category_id: categoryId,
      question_text: q.question_text,
      answer_a: q.answer_a,
      answer_b: q.answer_b,
      answer_c: q.answer_c,
      answer_d: q.answer_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation || null,
      active: true,
      always_include: false,
      source_type: "internet",
      sources,
      video_sources: q.video_sources || [],
      ai_generated: true,
      subcategory: q.subcategory ? String(q.subcategory).slice(0, 80) : null,
      difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : null,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "Nothing saved — the generated questions had no verifiable sources. Try again." },
      { status: 502 }
    );
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("questions").insert(rows);
  if (error) {
    console.error("[ai-generator save-direct] insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  await logAudit(guard.profile.id, "ai_questions_generated_saved", "questions", undefined, { count: rows.length });

  return NextResponse.json({
    saved: rows.length,
    requested: count,
    produced: kept.length,
    skippedNoSource,
    duplicatesRemoved: removed,
    droppedNoVideo,
    withVideos: rows.filter((r) => (r.video_sources as any[]).length > 0).length,
  });
}

/**
 * Existing question texts to dedupe against. Pulls from the bank by
 * category_id when saving into a specific category; otherwise (or in
 * addition) matches on the free-text subcategory/category label so the
 * trainer's predefined topics also avoid repeats. Capped for safety.
 */
async function existingQuestionTexts(categoryId: string, topicLabel: string): Promise<string[]> {
  const supabase = supabaseAdmin();
  const texts: string[] = [];
  try {
    if (categoryId) {
      const { data } = await supabase
        .from("questions")
        .select("question_text")
        .eq("category_id", categoryId)
        .limit(2000);
      for (const r of data || []) if (r?.question_text) texts.push(r.question_text);
    }
    // Also catch AI questions filed under the same subcategory label.
    const { data: bySub } = await supabase
      .from("questions")
      .select("question_text")
      .eq("subcategory", topicLabel)
      .limit(1000);
    for (const r of bySub || []) if (r?.question_text) texts.push(r.question_text);
  } catch (e) {
    console.error("[ai-generator] existingQuestionTexts failed (continuing without dedupe):", e);
  }
  return texts;
}

/** A trimmed recent-texts list passed to the model as the avoid-list. */
async function recentTexts(categoryId: string, topicLabel: string): Promise<string[]> {
  const all = await existingQuestionTexts(categoryId, topicLabel);
  // The prompt only needs a recent sample to steer away from repeats;
  // the hard dedupe after generation catches the rest.
  return all.slice(-40);
}
