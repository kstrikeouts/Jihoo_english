import Link from "next/link";
import { getQuizQuestions } from "@/lib/queries";
import QuizSession from "@/components/QuizSession";

export default async function TestPlayPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; count?: string }>;
}) {
  const params = await searchParams;
  const grade = params.grade && params.grade !== "all" ? Number(params.grade) : null;
  const count = Number(params.count ?? "10") || 10;

  const questions = await getQuizQuestions(grade, count);

  if (questions.length < 4) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-orange-100 bg-white p-10 text-center shadow-sm">
        <span className="text-4xl">🙏</span>
        <p className="font-semibold text-stone-600">아직 테스트할 단어가 부족해요.</p>
        <p className="text-sm text-stone-400">먼저 학습 모드에서 단어를 배워보세요.</p>
        <Link
          href="/learn"
          className="mt-2 rounded-full bg-orange-500 px-5 py-2 font-semibold text-white shadow hover:bg-orange-600"
        >
          학습하러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-bold text-stone-700">📝 테스트 중</h1>
      <QuizSession questions={questions} grade={grade} />
    </div>
  );
}
