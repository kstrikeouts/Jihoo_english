import Link from "next/link";
import { getDashboardStats } from "@/lib/queries";
import GradeProgressCard from "@/components/GradeProgressCard";

export default async function HomePage() {
  const stats = await getDashboardStats();
  const overallPercent =
    stats.totalWords === 0 ? 0 : Math.round((stats.totalMastered / stats.totalWords) * 100);

  return (
    <div className="flex flex-col gap-8">
      <section className="rounded-3xl bg-gradient-to-br from-orange-400 to-amber-300 p-6 text-white shadow-md">
        <h1 className="text-2xl font-extrabold">안녕, 지후! 오늘도 단어 공부 해볼까? 🐿️</h1>
        <p className="mt-1 text-sm text-orange-50">
          전체 {stats.totalWords}개 단어 중 {stats.totalMastered}개를 완전히 익혔어요 ({overallPercent}%)
        </p>
        <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-white transition-all"
            style={{ width: `${overallPercent}%` }}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Link
          href="/learn"
          className="flex flex-col items-center gap-1 rounded-2xl border border-orange-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="text-3xl">📖</span>
          <span className="font-bold text-stone-700">학습하기</span>
          <span className="text-xs text-stone-400">새 단어 배우기</span>
        </Link>
        <Link
          href="/review"
          className="relative flex flex-col items-center gap-1 rounded-2xl border border-orange-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          {stats.reviewDueCount > 0 && (
            <span className="absolute right-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
              {stats.reviewDueCount}
            </span>
          )}
          <span className="text-3xl">🔁</span>
          <span className="font-bold text-stone-700">복습하기</span>
          <span className="text-xs text-stone-400">오답 위주 복습</span>
        </Link>
        <Link
          href="/test"
          className="flex flex-col items-center gap-1 rounded-2xl border border-orange-100 bg-white p-4 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <span className="text-3xl">📝</span>
          <span className="font-bold text-stone-700">테스트</span>
          <span className="text-xs text-stone-400">실력 확인하기</span>
        </Link>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-stone-700">학년별 진도</h2>
          <span className="text-sm text-stone-400">정답률 {stats.accuracy}%</span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {stats.gradeStats.map((stat) => (
            <GradeProgressCard key={stat.grade} stat={stat} />
          ))}
        </div>
      </section>

      {stats.recentAttempts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-stone-700">최근 테스트 기록</h2>
          <div className="flex flex-col gap-2">
            {stats.recentAttempts.map((attempt) => {
              const percent = Math.round((attempt.correctAnswers / attempt.totalQuestions) * 100);
              return (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between rounded-xl border border-orange-100 bg-white px-4 py-2 text-sm shadow-sm"
                >
                  <span className="text-stone-500">
                    {attempt.grade ? `${attempt.grade}학년` : "전체 학년"} ·{" "}
                    {new Date(attempt.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                  <span className="font-bold text-orange-600">
                    {attempt.correctAnswers}/{attempt.totalQuestions} ({percent}%)
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
