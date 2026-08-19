import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { WORD_SEEDS } from "./wordData";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
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
