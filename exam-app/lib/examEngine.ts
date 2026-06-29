import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeExamWarnings, QuestionPoolStats } from "./examValidation";
import type { ExamSettings } from "./types";

// Fisher-Yates shuffle, in place
function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * loadExamSettings — the single settings row (id = 1). Falls back to
 * sane defaults if the row is somehow missing (shouldn't happen once
 * the SQL schema has been run, which seeds it).
 */
export async function loadExamSettings(): Promise<ExamSettings> {
  const supabase = supabaseAdmin();
  const { data } = await supabase.from("exam_settings").select("*").eq("id", 1).single();
  if (data) return data as ExamSettings;
  return {
    id: 1,
    total_questions: 50,
    pass_score: 0.8,
    default_questions_per_category: 2,
    selection_mode: "fixed_category_rules",
    randomize_question_order: true,
    include_always_questions: true,
    allow_retake: false,
    show_result_to_trainee: true,
    show_correct_answers_to_trainee: false,
  };
}

/**
 * getQuestionPoolStats
 * ---------------------------------------------------------------------
 * One DB round-trip producing everything computeExamWarnings() needs:
 * total active questions, always-include counts (active vs inactive),
 * and per-category counts of the "random fill" pool (active,
 * NOT always-include) alongside each category's fixed-rule target.
 * Used by the Admin Dashboard, the Exam Settings page, and the real
 * exam-build gate below — one source of truth for all three.
 */
export async function getQuestionPoolStats(): Promise<QuestionPoolStats> {
  const supabase = supabaseAdmin();

  const { count: totalActiveQuestions } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("active", true);

  const { count: alwaysIncludeActiveCount } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .eq("always_include", true);

  const { count: alwaysIncludeInactiveCount } = await supabase
    .from("questions")
    .select("*", { count: "exact", head: true })
    .eq("active", false)
    .eq("always_include", true);

  const { data: rules } = await supabase
    .from("category_rules")
    .select("category_id, questions_to_take, categories(name)");

  const categories = await Promise.all(
    (rules || []).map(async (r) => {
      const { count } = await supabase
        .from("questions")
        .select("*", { count: "exact", head: true })
        .eq("category_id", r.category_id)
        .eq("active", true)
        .eq("always_include", false);
      return {
        category_id: r.category_id,
        name: (r as any).categories?.name ?? "Unknown",
        activeNonMandatoryCount: count ?? 0,
        ruleQuestionsToTake: r.questions_to_take,
      };
    })
  );

  return {
    totalActiveQuestions: totalActiveQuestions ?? 0,
    alwaysIncludeActiveCount: alwaysIncludeActiveCount ?? 0,
    alwaysIncludeInactiveCount: alwaysIncludeInactiveCount ?? 0,
    categories,
  };
}

/**
 * buildRandomExam
 * ---------------------------------------------------------------------
 * 1. Loads exam_settings.
 * 2. Gathers all ACTIVE always_include questions (the "mandatory" set)
 *    — skipped entirely if settings.include_always_questions is false.
 * 3. Throws immediately if mandatory_count > total_questions.
 * 4. remaining = total_questions - mandatory_count.
 * 5. Fills `remaining` from active, non-mandatory questions using
 *    either fixed category rules or proportional auto-distribution
 *    (see fillFixedCategoryRules / fillAutoDistribute below).
 * 6. Never duplicates a question.
 * 7. Shuffles the FINAL list only if randomize_question_order is on;
 *    otherwise mandatory questions stay first, fill questions after.
 */
export async function buildRandomExam(): Promise<string[]> {
  const supabase = supabaseAdmin();
  const settings = await loadExamSettings();

  // ---- Upfront validation using the same logic the admin UI previews --
  const stats = await getQuestionPoolStats();
  const preview = computeExamWarnings(settings, stats);
  const blockingError = preview.warnings.find((w) => w.level === "error");
  if (blockingError) throw new Error(blockingError.message);

  // ---- 1 & 2: mandatory (always-include) questions -------------------
  let mandatoryIds: string[] = [];
  if (settings.include_always_questions) {
    const { data: mandatory, error } = await supabase
      .from("questions")
      .select("id")
      .eq("active", true)
      .eq("always_include", true);
    if (error) throw new Error(`Failed to load always-include questions: ${error.message}`);
    mandatoryIds = (mandatory || []).map((q) => q.id);
  }

  const remaining = settings.total_questions - mandatoryIds.length;
  const mandatorySet = new Set(mandatoryIds);

  // ---- 5: fill the remaining slots ------------------------------------
  let fillIds: string[];
  if (remaining === 0) {
    fillIds = [];
  } else if (settings.selection_mode === "fixed_category_rules") {
    fillIds = await fillFixedCategoryRules(remaining, mandatorySet);
  } else {
    fillIds = await fillAutoDistribute(remaining, mandatorySet, settings.default_questions_per_category);
  }

  if (fillIds.length < remaining) {
    throw new Error(
      `Not enough active questions to build the exam — needed ${remaining} more beyond the mandatory questions, only found ${fillIds.length}.`
    );
  }

  // ---- 6 & 7: combine, never duplicate, shuffle if configured ---------
  const final = [...mandatoryIds, ...fillIds];
  if (settings.randomize_question_order) shuffle(final);
  return final;
}

/**
 * fillFixedCategoryRules
 * ---------------------------------------------------------------------
 * Tries to take exactly category_rules.questions_to_take from each
 * category's active, non-mandatory pool (same as the original v1
 * engine). Because total_questions is now independently configurable,
 * the sum of category rules may not exactly equal `remaining` — so:
 *   - if the rule-based picks add up to MORE than remaining, trim
 *     randomly down to `remaining`.
 *   - if they add up to LESS, top up randomly from any leftover active
 *     non-mandatory questions (any category) not already selected.
 * This satisfies "respect category rules as much as possible" while
 * still always hitting the exact configured total.
 */
async function fillFixedCategoryRules(remaining: number, exclude: Set<string>): Promise<string[]> {
  const supabase = supabaseAdmin();

  const { data: rules } = await supabase.from("category_rules").select("category_id, questions_to_take");
  const selected: string[] = [];

  for (const rule of rules || []) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id")
      .eq("category_id", rule.category_id)
      .eq("active", true)
      .eq("always_include", false);
    const ids = (qs || []).map((q) => q.id).filter((id) => !exclude.has(id));
    shuffle(ids);
    selected.push(...ids.slice(0, rule.questions_to_take));
  }

  if (selected.length > remaining) {
    shuffle(selected);
    return selected.slice(0, remaining);
  }
  if (selected.length === remaining) {
    return selected;
  }

  // Top up from any active, non-mandatory, not-yet-selected question
  const stillNeeded = remaining - selected.length;
  const alreadySelected = new Set(selected);
  const { data: leftoverPool } = await supabase
    .from("questions")
    .select("id")
    .eq("active", true)
    .eq("always_include", false);
  const leftover = (leftoverPool || [])
    .map((q) => q.id)
    .filter((id) => !exclude.has(id) && !alreadySelected.has(id));
  shuffle(leftover);
  selected.push(...leftover.slice(0, stillNeeded));
  return selected;
}

/**
 * fillAutoDistribute
 * ---------------------------------------------------------------------
 * Ignores category_rules entirely. Gives every active category
 * `default_questions_per_category` as a baseline (capped by how many
 * questions that category actually has), then spreads any leftover
 * round-robin across categories that still have unused questions,
 * until `remaining` is reached or the whole pool is exhausted.
 */
async function fillAutoDistribute(
  remaining: number,
  exclude: Set<string>,
  perCategoryBaseline: number
): Promise<string[]> {
  const supabase = supabaseAdmin();

  const { data: categories } = await supabase.from("categories").select("id");
  const pools: { categoryId: string; ids: string[] }[] = [];

  for (const cat of categories || []) {
    const { data: qs } = await supabase
      .from("questions")
      .select("id")
      .eq("category_id", cat.id)
      .eq("active", true)
      .eq("always_include", false);
    const ids = (qs || []).map((q) => q.id).filter((id) => !exclude.has(id));
    shuffle(ids);
    if (ids.length > 0) pools.push({ categoryId: cat.id, ids });
  }

  const selected: string[] = [];

  // Baseline pass
  for (const pool of pools) {
    const take = Math.min(perCategoryBaseline, pool.ids.length, remaining - selected.length);
    if (take > 0) {
      selected.push(...pool.ids.splice(0, take));
    }
    if (selected.length >= remaining) break;
  }

  // Round-robin top-up pass using whatever each pool has left
  let progress = true;
  while (selected.length < remaining && progress) {
    progress = false;
    for (const pool of pools) {
      if (selected.length >= remaining) break;
      if (pool.ids.length > 0) {
        selected.push(pool.ids.shift()!);
        progress = true;
      }
    }
  }

  return selected;
}

/**
 * snapshotQuestions
 * ---------------------------------------------------------------------
 * Given the question IDs buildRandomExam() picked, fetches the full
 * content (category name, text, all 4 options, correct answer,
 * explanation) needed to populate exam_attempt_questions' snapshot
 * columns — so the exam (and every later review of it) never depends
 * on the live `questions` row continuing to exist or stay unchanged.
 * Returns the snapshots in the SAME ORDER as the input IDs.
 */
export type QuestionSnapshot = {
  question_id: string;
  category_name: string;
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
  correct_answer: string;
  explanation: string | null;
};

export async function snapshotQuestions(questionIds: string[]): Promise<QuestionSnapshot[]> {
  const supabase = supabaseAdmin();
  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, question_text, answer_a, answer_b, answer_c, answer_d, correct_answer, explanation, categories(name)")
    .in("id", questionIds);
  if (error) throw new Error(`Failed to load question content for snapshot: ${error.message}`);

  const byId = new Map((questions || []).map((q) => [q.id, q]));
  return questionIds.map((id) => {
    const q = byId.get(id);
    if (!q) throw new Error(`Question ${id} was not found while building the exam snapshot.`);
    return {
      question_id: q.id,
      category_name: (q as any).categories?.name ?? "Unknown",
      question_text: q.question_text,
      answer_a: q.answer_a,
      answer_b: q.answer_b,
      answer_c: q.answer_c,
      answer_d: q.answer_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation,
    };
  });
}

/**
 * assertOwnsAttempt — true only if `profileId` is the trainee this
 * exam attempt belongs to. Used by every exam/* API route so one
 * trainee can never read or modify another trainee's in-progress exam,
 * even though all of these routes run under the service-role key.
 */
export async function assertOwnsAttempt(profileId: string, attemptId: string): Promise<boolean> {
  const supabase = supabaseAdmin();
  const { data } = await supabase.from("exam_attempts").select("profile_id").eq("id", attemptId).maybeSingle();
  return !!data && data.profile_id === profileId;
}
