export type Category = {
  id: string;
  name: string;
  created_at?: string;
};

export type CategoryRule = {
  category_id: string;
  questions_to_take: number;
};

export type Question = {
  id: string;
  category_id: string;
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string | null;
  active: boolean;
  always_include: boolean;
  created_at?: string;
  updated_at?: string;
};

/** @deprecated exam-related fields moved to ExamSettings. Only
 *  music_globally_enabled is still read from this table. */
export type AppSettings = {
  id: number;
  passing_score: number;
  show_explanations_to_trainee: boolean;
  total_questions: number;
  music_globally_enabled: boolean;
};

export type SelectionMode = "fixed_category_rules" | "auto_distribute";

export type ExamSettings = {
  id: number;
  total_questions: number;
  pass_score: number; // 0..1
  default_questions_per_category: number;
  selection_mode: SelectionMode;
  randomize_question_order: boolean;
  include_always_questions: boolean;
  allow_retake: boolean; // global master switch — ANDed with each trainee's exam_access.allow_retake
  show_result_to_trainee: boolean;
  show_correct_answers_to_trainee: boolean;
  updated_at?: string;
};

export type ExamAttempt = {
  id: string;
  trainee_name: string;
  user_id: string | null;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  score_percent: number | null;
  correct_count: number | null;
  wrong_count: number | null;
  pass_fail: "PASS" | "FAIL" | null;
  status: "in_progress" | "completed";
};

// A full snapshot of one question as it appeared at exam time — see
// supabase/schema.sql for why this duplicates question content rather
// than referencing the live `questions` row.
export type ExamAttemptQuestion = {
  attempt_id: string;
  question_number: number;
  question_id: string | null; // optional traceability link only — never relied on for display
  category_name: string;
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string | null;
};

// Keyed by (attempt_id, question_number) — NOT question_id. See
// supabase/schema.sql for why.
export type ExamAnswer = {
  attempt_id: string;
  question_number: number;
  selected_answer: "A" | "B" | "C" | "D" | null;
};

// Shape used by the client while taking the exam (joined view)
export type ExamQuestionView = {
  question_number: number;
  question_id: string;
  category_name: string;
  question_text: string;
  answer_a: string;
  answer_b: string;
  answer_c: string;
  answer_d: string;
  selected_answer: "A" | "B" | "C" | "D" | null;
};
