"use client";

import { useState } from "react";
import StartExamButton from "@/components/StartExamButton";

/**
 * HomeHero — the landing-page card (title + Start Exam / Sign In).
 * Wrapped as a client component so it can offer a "Hide" toggle that
 * collapses the card to a small button, letting the user see the full
 * background video. Mirrors the same toggle on the /login page.
 */
export default function HomeHero({
  isLoggedIn,
  displayName,
  canStart,
  blockedReason,
  totalQuestions,
}: {
  isLoggedIn: boolean;
  displayName: string | null;
  canStart: boolean;
  blockedReason: string | null;
  totalQuestions: number;
}) {
  const [hidden, setHidden] = useState(false);

  return (
    <>
      <button
        onClick={() => setHidden((h) => !h)}
        className="fixed top-20 right-4 z-50 bg-black/50 hover:bg-black/70 text-white text-xs px-3 py-1.5 rounded-full shadow-lg"
      >
        {hidden ? "Show" : "Hide"}
      </button>

      {!hidden && (
        <div className="text-center flex flex-col items-center">
          <h1 className="text-4xl md:text-5xl font-bold mb-2" style={{ color: "var(--text-color)" }}>
            Unit Function Exam
          </h1>
          <p className="text-lg font-medium mb-8" style={{ color: "var(--accent-color)" }}>
            Operator Training &amp; Assessment
          </p>

          <div className="rounded-2xl shadow-card p-6 w-full max-w-md text-left" style={{ backgroundColor: "var(--card-color)" }}>
            {isLoggedIn ? (
              <>
                <p className="text-sm text-gray-500 mb-4">
                  Signed in as <strong>{displayName}</strong>
                </p>
                <StartExamButton canStart={canStart} blockedReason={blockedReason} />
                <a
                  href="/trainer"
                  className="block text-center mt-3 border border-teal-700 text-teal-700 font-semibold py-2.5 rounded-lg hover:bg-teal-700/5"
                >
                  🎓 AI Knowledge Trainer
                </a>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">Sign in with your username to begin the exam.</p>
                <a
                  href="/login"
                  style={{ backgroundColor: "var(--button-color)" }}
                  className="block text-center text-navy-900 font-bold py-3 rounded-lg hover:opacity-90"
                >
                  Sign In
                </a>
              </>
            )}
            <p className="text-xs text-gray-500 mt-3">{totalQuestions} questions • mixed order</p>
          </div>
        </div>
      )}
    </>
  );
}
