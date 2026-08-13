-- CreateTable
CREATE TABLE "Word" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "meaning" TEXT NOT NULL,
    "partOfSpeech" TEXT NOT NULL,
    "exampleEn" TEXT NOT NULL,
    "exampleKo" TEXT NOT NULL,
    "grade" INTEGER NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WordProgress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "wordId" INTEGER NOT NULL,
    "box" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "correctCount" INTEGER NOT NULL DEFAULT 0,
    "wrongCount" INTEGER NOT NULL DEFAULT 0,
    "lastReviewedAt" DATETIME,
    "nextReviewAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WordProgress_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TestAttempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grade" INTEGER,
    "totalQuestions" INTEGER NOT NULL,
    "correctAnswers" INTEGER NOT NULL
);

-- CreateTable
CREATE TABLE "TestAttemptItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "testAttemptId" INTEGER NOT NULL,
    "wordId" INTEGER NOT NULL,
    "wasCorrect" BOOLEAN NOT NULL,
    CONSTRAINT "TestAttemptItem_testAttemptId_fkey" FOREIGN KEY ("testAttemptId") REFERENCES "TestAttempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TestAttemptItem_wordId_fkey" FOREIGN KEY ("wordId") REFERENCES "Word" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Word_text_key" ON "Word"("text");

-- CreateIndex
CREATE UNIQUE INDEX "WordProgress_wordId_key" ON "WordProgress"("wordId");
