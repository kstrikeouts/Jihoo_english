import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";
import { WORD_SEEDS } from "./wordData";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const dbFilePath = dbUrl.replace(/^file:/, "");
const resolvedPath = path.isAbsolute(dbFilePath)
  ? dbFilePath
  : path.join(process.cwd(), dbFilePath);

const adapter = new PrismaBetterSqlite3({ url: resolvedPath });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log(`Seeding ${WORD_SEEDS.length} words...`);

  for (const seed of WORD_SEEDS) {
    await prisma.word.upsert({
      where: { text: seed.text },
      update: {
        meaning: seed.meaning,
        partOfSpeech: seed.partOfSpeech,
        exampleEn: seed.exampleEn,
        exampleKo: seed.exampleKo,
        grade: seed.grade,
        category: seed.category,
      },
      create: seed,
    });
  }

  console.log("Seeding complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
