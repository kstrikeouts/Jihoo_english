// 간이 Leitner 박스 기반 SRS(간격 반복 학습) 로직
// box 0: 미학습(NEW) / 1~2: 학습중(LEARNING) / 3~4: 복습중(REVIEWING) / 5: 완료(MASTERED)

export const MAX_BOX = 5;

const INTERVAL_DAYS_BY_BOX: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 7,
  5: 15,
};

export type WordStatus = "NEW" | "LEARNING" | "REVIEWING" | "MASTERED";

export function statusFromBox(box: number): WordStatus {
  if (box <= 0) return "NEW";
  if (box <= 2) return "LEARNING";
  if (box <= 4) return "REVIEWING";
  return "MASTERED";
}

export function nextBox(currentBox: number, wasCorrect: boolean): number {
  if (wasCorrect) return Math.min(currentBox + 1, MAX_BOX);
  return 1;
}

export function nextReviewDate(box: number, from: Date = new Date()): Date {
  const days = INTERVAL_DAYS_BY_BOX[box] ?? 1;
  const result = new Date(from);
  result.setDate(result.getDate() + days);
  return result;
}

export const STATUS_LABEL_KO: Record<WordStatus, string> = {
  NEW: "새 단어",
  LEARNING: "학습중",
  REVIEWING: "복습중",
  MASTERED: "완료",
};

export const STATUS_COLOR: Record<WordStatus, string> = {
  NEW: "bg-slate-200 text-slate-700",
  LEARNING: "bg-amber-200 text-amber-800",
  REVIEWING: "bg-sky-200 text-sky-800",
  MASTERED: "bg-emerald-200 text-emerald-800",
};
