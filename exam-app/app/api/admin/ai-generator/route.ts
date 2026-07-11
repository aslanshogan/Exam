import { NextRequest, NextResponse } from "next/server";
import { requirePermission, canManageQuestions } from "@/lib/auth";
import { generateTrainerQuestions } from "@/lib/aiTrainer";

// Web-search-grounded generation: allow up to 60s per call. Bigger
// batches (20/50) are chunked into multiple calls by the admin UI.
export const maxDuration = 60;

/**
 * POST /api/admin/ai-generator  body: { category, difficulty, count }
 * Generates a BATCH of questions for admin review. Nothing is saved —
 * the admin reviews the list and imports the ones they approve via
 * /api/admin/ai-generator/import.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission(req, canManageQuestions);
  if (guard.response) return guard.response;

  const body = await req.json().catch(() => ({}));
  const category = typeof body.category === "string" && body.category.trim() ? body.category.trim().slice(0, 120) : "";
  const difficulty = ["easy", "medium", "hard", "mixed"].includes(body.difficulty) ? body.difficulty : "medium";
  const count = Math.max(1, Math.min(10, Number(body.count) || 5)); // per-call cap; UI chunks 20/50
  if (!category) return NextResponse.json({ error: "category is required." }, { status: 400 });

  const gen = await generateTrainerQuestions({ category, difficulty, count });
  if (gen.error && gen.questions.length === 0) {
    return NextResponse.json({ error: gen.error }, { status: 502 });
  }
  return NextResponse.json({ questions: gen.questions, requested: count, produced: gen.questions.length });
}
