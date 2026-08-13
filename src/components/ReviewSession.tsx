"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { recordAnswer } from "@/lib/actions";
import SpeakButton from "@/components/SpeakButton";
import type { ReviewWord } from "@/lib/queries";

export default function ReviewSession({ words }: { words: ReviewWord[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [finished, setFinished] = useState(false);

  const current = words[index];

  function handleAnswer(wasCorrect: boolean) {
    if (!current) return;
    if (wasCorrect) setCorrectCount((c) => c + 1);
    startTransition(async () => {
      await recordAnswer(current.id, wasCorrect);
    });
    if (index + 1 >= words.length) {
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setFlipped(false);
    }
  }

  if (finished || !current) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-orange-100 bg-white p-8 text-center shadow-sm">
        <span className="text-5xl">🔁</span>
        <h2 className="text-xl font-bold text-stone-700">복습을 완료했어요!</h2>
        <p className="text-stone-500">
          {words.length}개 중 {correctCount}개를 맞혔어요.
        </p>
        <div className="mt-2 flex gap-3">
          <Link
            href="/test"
            className="rounded-full bg-orange-500 px-5 py-2 font-semibold text-white shadow hover:bg-orange-600"
          >
            테스트 보러 가기
          </Link>
          <Link
            href="/"
            className="rounded-full bg-stone-100 px-5 py-2 font-semibold text-stone-600 hover:bg-stone-200"
          >
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5">
      <div className="w-full text-center text-sm font-medium text-stone-400">
        {index + 1} / {words.length}
      </div>

      <div className="flip-container h-72 w-full max-w-sm">
        <div
          className={`card-flip-inner relative h-full w-full cursor-pointer ${flipped ? "flipped" : ""}`}
          onClick={() => setFlipped((f) => !f)}
        >
          <div className="card-face absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-3xl border border-sky-100 bg-white p-6 shadow-md">
            <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-500">
              {current.grade}학년 · {current.category}
            </span>
            <h2 className="text-4xl font-extrabold text-stone-800">{current.text}</h2>
            <div onClick={(e) => e.stopPropagation()}>
              <SpeakButton text={current.text} size="lg" />
            </div>
            <p className="text-xs text-stone-400">뜻이 기억나나요? 카드를 눌러보세요</p>
          </div>
          <div className="card-face card-face-back absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-3xl border border-sky-100 bg-sky-50 p-6 text-center shadow-md">
            <span className="text-sm font-semibold text-sky-500">{current.partOfSpeech}</span>
            <h3 className="text-3xl font-extrabold text-stone-800">{current.meaning}</h3>
            <p className="text-sm font-medium text-stone-600">{current.exampleEn}</p>
            <p className="text-sm text-stone-400">{current.exampleKo}</p>
          </div>
        </div>
      </div>

      <div className="flex w-full max-w-sm gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleAnswer(false)}
          className="flex-1 rounded-full bg-white border-2 border-red-200 py-3 font-bold text-red-500 shadow-sm transition hover:bg-red-50 disabled:opacity-50"
        >
          틀렸어요
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => handleAnswer(true)}
          className="flex-1 rounded-full bg-sky-500 py-3 font-bold text-white shadow transition hover:bg-sky-600 disabled:opacity-50"
        >
          맞았어요
        </button>
      </div>
    </div>
  );
}
