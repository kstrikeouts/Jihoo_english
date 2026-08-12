"use server";

import { prisma } from "@/lib/prisma";
import { nextBox, nextReviewDate, statusFromBox } from "@/lib/srs";
import { revalidatePath } from "next/cache";

export async function recordAnswer(wordId: number, wasCorrect: boolean) {
  const existing = await prisma.wordProgress.findUnique({ where: { wordId } });
  const currentBox = existing?.box ?? 0;
  const updatedBox = nextBox(currentBox, wasCorrect);
  const now = new Date();
  const reviewAt = nextReviewDate(updatedBox, now);
  const status = statusFromBox(updatedBox);

  await prisma.wordProgress.upsert({
    where: { wordId },
    create: {
      wordId,
      box: updatedBox,
      status,
      correctCount: wasCorrect ? 1 : 0,
      wrongCount: wasCorrect ? 0 : 1,
      lastReviewedAt: now,
      nextReviewAt: reviewAt,
    },
    update: {
      box: updatedBox,
      status,
      correctCount: { increment: wasCorrect ? 1 : 0 },
      wrongCount: { increment: wasCorrect ? 0 : 1 },
      lastReviewedAt: now,
      nextReviewAt: reviewAt,
    },
  });

  revalidatePath("/");
  revalidatePath("/learn");
  revalidatePath("/review");
}

export interface QuizAnswerInput {
  wordId: number;
  wasCorrect: boolean;
}

export async function submitQuizAttempt(grade: number | null, answers: QuizAnswerInput[]) {
  for (const answer of answers) {
    await recordAnswer(answer.wordId, answer.wasCorrect);
  }

  const correctAnswers = answers.filter((a) => a.wasCorrect).length;

  const attempt = await prisma.testAttempt.create({
    data: {
      grade: grade ?? null,
      totalQuestions: answers.length,
      correctAnswers,
      items: {
        create: answers.map((a) => ({
          wordId: a.wordId,
          wasCorrect: a.wasCorrect,
        })),
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/dashboard");

  return attempt.id;
}
