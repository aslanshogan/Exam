import type { ExamSettings, SelectionMode } from "./types";

export type CategoryPoolInfo = {
  category_id: string;
  name: string;
  /** Active questions in this category, EXCLUDING always-include ones (the random-fill pool) */
  activeNonMandatoryCount: number;
  /** From category_rules.questions_to_take — only meaningful in fixed_category_rules mode */
  ruleQuestionsToTake: number;
};

export type QuestionPoolStats = {
  totalActiveQuestions: number;
  alwaysIncludeActiveCount: number;
  alwaysIncludeInactiveCount: number;
  categories: CategoryPoolInfo[];
};

export type ExamWarning = { level: "error" | "warning"; message: string };

export type ExamBuildPreview = {
  mandatoryCount: number;
  remainingNeeded: number;
  totalAvailableForRemaining: number;
  canBuild: boolean;
  warnings: ExamWarning[];
};

/**
 * computeExamWarnings
 * ---------------------------------------------------------------------
 * Pure function — no DB access — so it can run identically in:
 *   1. The Admin Exam Settings page (instant feedback as the form changes,
 *      before the admin even saves)
 *   2. The Admin Dashboard (canonical "can this exam currently be built?")
 *   3. lib/examEngine.ts buildRandomExam() (the actual gate before
 *      generating a real attempt)
 */
export function computeExamWarnings(
  settings: Pick<ExamSettings, "total_questions" | "selection_mode" | "include_always_questions">,
  stats: QuestionPoolStats
): ExamBuildPreview {
  const warnings: ExamWarning[] = [];

  const mandatoryCount = settings.include_always_questions ? stats.alwaysIncludeActiveCount : 0;

  if (settings.include_always_questions && stats.alwaysIncludeInactiveCount > 0) {
    warnings.push({
      level: "warning",
      message: `${stats.alwaysIncludeInactiveCount} always-include question(s) are inactive and will be skipped.`,
    });
  }

  if (mandatoryCount > settings.total_questions) {
    warnings.push({
      level: "error",
      message:
        "Too many always-include questions. Total exam size is smaller than mandatory questions.",
    });
    return { mandatoryCount, remainingNeeded: 0, totalAvailableForRemaining: 0, canBuild: false, warnings };
  }

  const remainingNeeded = settings.total_questions - mandatoryCount;

  const totalAvailableForRemaining = stats.categories.reduce((sum, c) => sum + c.activeNonMandatoryCount, 0);

  if (totalAvailableForRemaining < remainingNeeded) {
    warnings.push({
      level: "error",
      message: `Not enough active questions to fill the exam — need ${remainingNeeded} more, only ${totalAvailableForRemaining} available outside the mandatory set.`,
    });
  }

  if (settings.selection_mode === "fixed_category_rules") {
    for (const c of stats.categories) {
      if (c.ruleQuestionsToTake > 0 && c.activeNonMandatoryCount < c.ruleQuestionsToTake) {
        warnings.push({
          level: "warning",
          message: `Category "${c.name}" has only ${c.activeNonMandatoryCount} available question(s), needs ${c.ruleQuestionsToTake} per the fixed category rule.`,
        });
      }
    }
  } else {
    const activeCategoryCount = stats.categories.filter((c) => c.activeNonMandatoryCount > 0).length;
    if (activeCategoryCount === 0 && remainingNeeded > 0) {
      warnings.push({ level: "error", message: "No active categories have any questions to auto-distribute." });
    } else if (remainingNeeded > 0 && remainingNeeded < activeCategoryCount) {
      warnings.push({
        level: "warning",
        message: `Total exam size (${settings.total_questions}) is quite small relative to ${activeCategoryCount} active categories — some categories may not be represented.`,
      });
    }
  }

  const canBuild = !warnings.some((w) => w.level === "error");
  return { mandatoryCount, remainingNeeded, totalAvailableForRemaining, canBuild, warnings };
}
