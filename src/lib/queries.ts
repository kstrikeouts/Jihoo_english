import { prisma } from "@/lib/prisma";
import { statusFromBox, type WordStatus } from "@/lib/srs";

export const GRADES = [3, 4, 5, 6] as const;

export interface LearnWord {
  id: number;
  text: string;
  meaning: string;
  partOfSpeech: string;
  exampleEn: string;
  exampleKo: string;
  grade: number;
  category: string;
  box: number;
}

export async function getLearnWords(grade: number, limit = 10): Promise<LearnWord[]> {
  const words = await prisma.word.findMany({
    where: {
      grade,
      OR: [{ progress: null }, { progress: { box: 0 } }],
    },
    orderBy: { id: "asc" },
    take: limit,
    include: { progress: true },
  });

  return words.map((w) => ({
    id: w.id,
    text: w.text,
    meaning: w.meaning,
    partOfSpeech: w.partOfSpeech,
    exampleEn: w.exampleEn,
    exampleKo: w.exampleKo,
    grade: w.grade,
    category: w.category,
    box: w.progress?.box ?? 0,
  }));
}

export interface ReviewWord extends LearnWord {
  wrongCount: number;
  nextReviewAt: Date | null;
}

export async function getReviewQueue(grade: number | null, limit = 20): Promise<ReviewWord[]> {
  const now = new Date();
  const words = await prisma.word.findMany({
    where: {
      ...(grade ? { grade } : {}),
      progress: {
        is: {
          box: { gt: 0 },
          nextReviewAt: { lte: now },
        },
      },
    },
    include: { progress: true },
  });

  return words
    .map((w) => ({
      id: w.id,
      text: w.text,
      meaning: w.meaning,
      partOfSpeech: w.partOfSpeech,
      exampleEn: w.exampleEn,
      exampleKo: w.exampleKo,
      grade: w.grade,
      category: w.category,
      box: w.progress?.box ?? 0,
      wrongCount: w.progress?.wrongCount ?? 0,
      nextReviewAt: w.progress?.nextReviewAt ?? null,
    }))
    .sort((a, b) => {
      if (b.wrongCount !== a.wrongCount) return b.wrongCount - a.wrongCount;
      const at = a.nextReviewAt?.getTime() ?? 0;
      const bt = b.nextReviewAt?.getTime() ?? 0;
      return at - bt;
    })
    .slice(0, limit);
}

export interface QuizQuestion {
  wordId: number;
  text: string;
  exampleEn: string;
  correctMeaning: string;
  choices: string[];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function getQuizQuestions(
  grade: number | null,
  count: number
): Promise<QuizQuestion[]> {
  const pool = await prisma.word.findMany({
    where: {
      ...(grade ? { grade } : {}),
      progress: { is: { box: { gt: 0 } } },
    },
  });

  const fullGradePool = await prisma.word.findMany({
    where: grade ? { grade } : {},
  });

  const source = pool.length >= 4 ? pool : fullGradePool;
  const chosen = shuffle(source).slice(0, Math.min(count, source.length));

  return chosen.map((word) => {
    const distractorPool = fullGradePool.filter((w) => w.id !== word.id);
    const distractors = shuffle(distractorPool)
      .slice(0, 3)
      .map((w) => w.meaning);
    const choices = shuffle([word.meaning, ...distractors]);
    return {
      wordId: word.id,
      text: word.text,
      exampleEn: word.exampleEn,
      correctMeaning: word.meaning,
      choices,
    };
  });
}

export interface GradeStat {
  grade: number;
  total: number;
  new: number;
  learning: number;
  reviewing: number;
  mastered: number;
}

export interface DashboardStats {
  totalWords: number;
  totalMastered: number;
  totalLearningOrAbove: number;
  reviewDueCount: number;
  accuracy: number;
  gradeStats: GradeStat[];
  recentAttempts: {
    id: number;
    createdAt: Date;
    grade: number | null;
    totalQuestions: number;
    correctAnswers: number;
  }[];
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const words = await prisma.word.findMany({ include: { progress: true } });
  const now = new Date();

  const gradeStats: GradeStat[] = GRADES.map((grade) => {
    const gradeWords = words.filter((w) => w.grade === grade);
    const counts: Record<WordStatus, number> = {
      NEW: 0,
      LEARNING: 0,
      REVIEWING: 0,
      MASTERED: 0,
    };
    for (const w of gradeWords) {
      const status = statusFromBox(w.progress?.box ?? 0);
      counts[status]++;
    }
    return {
      grade,
      total: gradeWords.length,
      new: counts.NEW,
      learning: counts.LEARNING,
      reviewing: counts.REVIEWING,
      mastered: counts.MASTERED,
    };
  });

  const totalMastered = gradeStats.reduce((sum, g) => sum + g.mastered, 0);
  const totalLearningOrAbove = words.filter((w) => (w.progress?.box ?? 0) > 0).length;

  const reviewDueCount = words.filter(
    (w) =>
      w.progress &&
      w.progress.box > 0 &&
      w.progress.nextReviewAt &&
      w.progress.nextReviewAt <= now
  ).length;

  const totalCorrect = words.reduce((sum, w) => sum + (w.progress?.correctCount ?? 0), 0);
  const totalWrong = words.reduce((sum, w) => sum + (w.progress?.wrongCount ?? 0), 0);
  const accuracy =
    totalCorrect + totalWrong === 0 ? 0 : Math.round((totalCorrect / (totalCorrect + totalWrong)) * 100);

  const recentAttempts = await prisma.testAttempt.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return {
    totalWords: words.length,
    totalMastered,
    totalLearningOrAbove,
    reviewDueCount,
    accuracy,
    gradeStats,
    recentAttempts,
  };
}
