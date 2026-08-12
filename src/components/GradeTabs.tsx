import Link from "next/link";
import { GRADES } from "@/lib/queries";

export default function GradeTabs({
  basePath,
  selectedGrade,
  includeAll = false,
}: {
  basePath: string;
  selectedGrade: number | null;
  includeAll?: boolean;
}) {
  const options: { label: string; grade: number | null }[] = [
    ...(includeAll ? [{ label: "전체", grade: null }] : []),
    ...GRADES.map((g) => ({ label: `${g}학년`, grade: g })),
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const isActive = opt.grade === selectedGrade;
        const href = opt.grade === null ? basePath : `${basePath}?grade=${opt.grade}`;
        return (
          <Link
            key={opt.label}
            href={href}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              isActive
                ? "bg-orange-500 text-white shadow"
                : "bg-white text-stone-500 border border-orange-100 hover:bg-orange-50"
            }`}
          >
            {opt.label}
          </Link>
        );
      })}
    </div>
  );
}
