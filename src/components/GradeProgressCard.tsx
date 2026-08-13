import type { GradeStat } from "@/lib/queries";

export default function GradeProgressCard({ stat }: { stat: GradeStat }) {
  const percent = stat.total === 0 ? 0 : Math.round((stat.mastered / stat.total) * 100);

  return (
    <div className="rounded-2xl border border-orange-100 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-stone-700">{stat.grade}학년</h3>
        <span className="text-sm font-semibold text-orange-600">{percent}%</span>
      </div>
      <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-stone-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-stone-500">
        <span>새 단어 {stat.new}</span>
        <span>학습중 {stat.learning}</span>
        <span>복습중 {stat.reviewing}</span>
        <span className="font-semibold text-emerald-600">완료 {stat.mastered}</span>
        <span className="ml-auto text-stone-400">전체 {stat.total}단어</span>
      </div>
    </div>
  );
}
