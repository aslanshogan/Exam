"use client";

import clsx from "clsx";

type Props = {
  letter: "A" | "B" | "C" | "D";
  text: string;
  selected: boolean;
  onSelect: () => void;
};

export default function AnswerOption({ letter, text, selected, onSelect }: Props) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={clsx(
        "w-full text-left px-4 py-3 rounded-xl border transition-all flex items-start gap-3",
        "hover:shadow-cardHover",
        selected
          ? "bg-navy-900 border-navy-900 text-white shadow-card"
          : "bg-white border-gray-200 text-navy-900"
      )}
    >
      <span
        className={clsx(
          "flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm",
          selected ? "bg-brandGreen text-navy-900" : "bg-gray-100 text-navy-800"
        )}
      >
        {letter}
      </span>
      <span className="leading-snug">{text}</span>
    </button>
  );
}
