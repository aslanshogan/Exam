"use client";

import AnswerOption from "./AnswerOption";
import type { ExamQuestionView } from "@/lib/types";

type Props = {
  q: ExamQuestionView;
  onAnswer: (letter: "A" | "B" | "C" | "D") => void;
};

export default function QuestionCard({ q, onAnswer }: Props) {
  return (
    <div className="card p-6 md:p-8">
      <div className="flex items-center justify-between mb-4">
        <span className="inline-block px-3 py-1 rounded-full bg-teal-700/10 text-teal-700 text-xs font-semibold uppercase tracking-wide">
          {q.category_name}
        </span>
      </div>
      <h2 className="text-lg md:text-xl font-semibold text-navy-900 mb-6 leading-relaxed">
        {q.question_text}
      </h2>
      <div className="space-y-3">
        <AnswerOption letter="A" text={q.answer_a} selected={q.selected_answer === "A"} onSelect={() => onAnswer("A")} />
        <AnswerOption letter="B" text={q.answer_b} selected={q.selected_answer === "B"} onSelect={() => onAnswer("B")} />
        <AnswerOption letter="C" text={q.answer_c} selected={q.selected_answer === "C"} onSelect={() => onAnswer("C")} />
        <AnswerOption letter="D" text={q.answer_d} selected={q.selected_answer === "D"} onSelect={() => onAnswer("D")} />
      </div>
    </div>
  );
}
