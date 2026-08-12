import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function TestResultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const attempt = await prisma.testAttempt.findUnique({
    where: { id: Number(id) },
    include: { items: { include: { word: true } } },
  });

  if (!attempt) notFound();

  const percent = Math.round((attempt.correctAnswers / attempt.totalQuestions) * 100);
  const wrongItems = attempt.items.filter((item) => !item.wasCorrect);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col items-center gap-2 rounded-3xl bg-gradient-to-br from-orange-400 to-amber-300 p-8 text-center text-white shadow-md">
        <span className="text-5xl">{percent >= 80 ? "🏆" : percent >= 50 ? "👏" : "💪"}</span>
        <h1 className="text-2xl font-extrabold">
          {attempt.correctAnswers} / {attempt.totalQuestions} 개 정답
        </h1>
        <p className="text-orange-50">정답률 {percent}%</p>
      </section>

      {wrongItems.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-stone-700">틀린 단어 다시 보기</h2>
          <div className="flex flex-col gap-2">
            {wrongItems.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50 px-4 py-2"
              >
                <span className="font-bold text-stone-700">{item.word.text}</span>
                <span className="text-sm text-stone-500">{item.word.meaning}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="flex justify-center gap-3">
        <Link
          href="/review"
          className="rounded-full bg-sky-500 px-5 py-2 font-semibold text-white shadow hover:bg-sky-600"
        >
          복습하러 가기
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
