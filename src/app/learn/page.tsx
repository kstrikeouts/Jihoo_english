import { getLearnWords } from "@/lib/queries";
import GradeTabs from "@/components/GradeTabs";
import LearnSession from "@/components/LearnSession";

export default async function LearnPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>;
}) {
  const params = await searchParams;
  const grade = Number(params.grade ?? "3") || 3;
  const words = await getLearnWords(grade, 10);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-3 text-xl font-bold text-stone-700">📖 단어 학습</h1>
        <GradeTabs basePath="/learn" selectedGrade={grade} />
      </div>

      {words.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-orange-100 bg-white p-10 text-center shadow-sm">
          <span className="text-4xl">✅</span>
          <p className="font-semibold text-stone-600">
            {grade}학년의 모든 단어를 이미 학습했어요!
          </p>
          <p className="text-sm text-stone-400">복습 모드에서 실력을 다져보세요.</p>
        </div>
      ) : (
        <LearnSession key={grade} words={words} />
      )}
    </div>
  );
}
