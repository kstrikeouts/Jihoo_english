import { getReviewQueue } from "@/lib/queries";
import GradeTabs from "@/components/GradeTabs";
import ReviewSession from "@/components/ReviewSession";

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>;
}) {
  const params = await searchParams;
  const grade = params.grade ? Number(params.grade) || null : null;
  const words = await getReviewQueue(grade, 20);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mb-3 text-xl font-bold text-stone-700">🔁 오늘의 복습</h1>
        <GradeTabs basePath="/review" selectedGrade={grade} includeAll />
      </div>

      {words.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-sky-100 bg-white p-10 text-center shadow-sm">
          <span className="text-4xl">👍</span>
          <p className="font-semibold text-stone-600">지금 복습할 단어가 없어요!</p>
          <p className="text-sm text-stone-400">
            학습 모드에서 새 단어를 배우거나, 나중에 다시 확인해보세요.
          </p>
        </div>
      ) : (
        <ReviewSession key={grade ?? "all"} words={words} />
      )}
    </div>
  );
}
