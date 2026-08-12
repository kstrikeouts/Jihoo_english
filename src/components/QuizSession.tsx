"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitQuizAttempt, type QuizAnswerInput } from "@/lib/actions";
import SpeakButton from "@/components/SpeakButton";
import type { QuizQuestion } from "@/lib/queries";

export default function QuizSession({
  questions,
  grade,
}: {
  questions: QuizQuestion[];
  grade: number | null;
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QuizAnswerInput[]>([]);
  const [isPending, startTransition] = useTransition();

  const current = questions[index];
  const isLast = index + 1 >= questions.length;

  function handleSelect(choice: string) {
    if (selected) return;
    setSelected(choice);
    const wasCorrect = choice === current.correctMeaning;
    const updated = [...answers, { wordId: current.wordId, wasCorrect }];
    setAnswers(updated);

    setTimeout(() => {
      if (isLast) {
        startTransition(async () => {
          const attemptId = await submitQuizAttempt(grade, updated);
          router.push(`/test/result/${attemptId}`);
        });
      } else {
        setIndex((i) => i + 1);
        setSelected(null);
      }
    }, 900);
  }

  if (!current) return null;

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-full text-center text-sm font-medium text-stone-400">
        {index + 1} / {questions.length}
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-orange-100 bg-white p-6 text-center shadow-md">
        <div className="mb-4 flex items-center justify-center gap-3">
          <h2 className="text-3xl font-extrabold text-stone-800">{current.text}</h2>
          <SpeakButton text={current.text} />
        </div>
        <p className="mb-4 text-sm text-stone-400">{current.exampleEn}</p>

        <div className="flex flex-col gap-2">
          {current.choices.map((choice) => {
            const isCorrectChoice = choice === current.correctMeaning;
            const isSelected = choice === selected;
            let stateClass = "border-stone-200 bg-white hover:bg-orange-50";
            if (selected) {
              if (isCorrectChoice) stateClass = "border-emerald-400 bg-emerald-50 text-emerald-700";
              else if (isSelected) stateClass = "border-red-300 bg-red-50 text-red-600";
              else stateClass = "border-stone-100 bg-white opacity-60";
            }
            return (
              <button
                key={choice}
                type="button"
                disabled={!!selected || isPending}
                onClick={() => handleSelect(choice)}
                className={`rounded-xl border-2 px-4 py-3 text-left font-semibold transition ${stateClass}`}
              >
                {choice}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
