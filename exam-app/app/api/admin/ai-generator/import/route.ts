import { NextRequest, NextResponse } from "next/server";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { logAudit } from "@/lib/auditLog";
import { isValidHttpUrl, validateVideoLink } from "@/lib/aiTrainer";
import { ensureCategoryByName } from "@/lib/ensureCategory";

/**
 * POST /api/admin/ai-generator/import
 * body: { topic, questions: [{ question_text, answer_a..d,
 *         correct_answer, explanation, difficulty, subcategory,
 *         sources:[{title,url}], video_sources:[...] }] }
 * ---------------------------------------------------------------------
 * Files reviewed AI questions into a bank category NAMED AFTER THE TOPIC
 * (auto-created if missing), so the admin never has to pick from — or
 * even see — their existing exam categories here. Saves metadata
 * (source_type='internet', sources, video_sources, ai_generated=true,
 * subcategory, difficulty).
 *
 * SERVER-ENFORCED: 4 answers + valid correct letter; >=1 valid written
 * source URL (else 400 naming the index, never sources=null); videos
 * optional but strictly validated.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => ({}));
  const topic = typeof body.topic === "string" ? body.topic.trim() : "";
  const list: any[] = Array.isArray(body.questions) ? body.questions : [];
  if (list.length === 0) return NextResponse.json({ error: "No questions selected." }, { status: 400 });
  if (!topic) return NextResponse.json({ error: "Topic is required to file the questions." }, { status: 400 });

  // One category for the whole import, named after the topic.
  const ensured = await ensureCategoryByName(topic);
  if (!ensured.id) return NextResponse.json({ error: "Could not create a bank category for this topic." }, { status: 500 });
  const categoryId = ensured.id;

  const rows = [];
  const problems: string[] = [];

  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    const label = `Question ${i + 1}`;

    if (!q || typeof q.question_text !== "string" || !q.question_text.trim()) {
      problems.push(`${label}: missing question text.`);
      continue;
    }
    if (!["A", "B", "C", "D"].includes(q.correct_answer)) { problems.push(`${label}: no valid correct answer.`); continue; }
    if (!q.answer_a || !q.answer_b || !q.answer_c || !q.answer_d) { problems.push(`${label}: all four answers are required.`); continue; }

    // Written sources — REQUIRED. Keep only entries with a title and a
    // structurally valid URL; reject the whole question if none remain.
    const sources = (Array.isArray(q.sources) ? q.sources : [])
      .map((s: any) => ({ title: String(s?.title || "").trim(), url: isValidHttpUrl(s?.url) }))
      .filter((s: any) => s.title && s.url);
    if (sources.length === 0) {
      problems.push(`${label}: needs at least one written source with a valid URL.`);
      continue;
    }

    // Videos — optional, strictly validated; invalid ones silently dropped.
    const videos = (Array.isArray(q.video_sources) ? q.video_sources : [])
      .map((v: any) => validateVideoLink(v))
      .filter((v: any): v is NonNullable<typeof v> => v !== null);

    rows.push({
      category_id: categoryId,
      question_text: q.question_text.trim(),
      answer_a: q.answer_a,
      answer_b: q.answer_b,
      answer_c: q.answer_c,
      answer_d: q.answer_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation || null,
      active: true,
      always_include: false,
      source_type: "internet",
      sources, // guaranteed non-empty
      video_sources: videos, // may be []
      ai_generated: true,
      subcategory: typeof q.subcategory === "string" && q.subcategory.trim() ? q.subcategory.trim().slice(0, 80) : null,
      difficulty: ["easy", "medium", "hard"].includes(q.difficulty) ? q.difficulty : null,
    });
  }

  // If ANY selected question failed a hard rule, reject the whole import
  // with the specific problems — nothing is imported with a missing source.
  if (problems.length > 0) {
    return NextResponse.json(
      { error: `Import blocked — fix these first:\n• ${problems.join("\n• ")}`, problems },
      { status: 400 }
    );
  }

  const supabase = supabaseAdmin();
  const { error } = await supabase.from("questions").insert(rows);
  if (error) {
    console.error("[ai-generator/import] insert failed:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(guard.profile.id, "ai_questions_imported", "questions", undefined, { count: rows.length });
  return NextResponse.json({ ok: true, imported: rows.length });
}
