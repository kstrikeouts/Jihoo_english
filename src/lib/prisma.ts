import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import path from "node:path";

const dbUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const dbFilePath = dbUrl.replace(/^file:/, "");
const resolvedPath = path.isAbsolute(dbFilePath)
  ? dbFilePath
  : path.join(/* turbopackIgnore: true */ process.cwd(), dbFilePath);

const adapter = new PrismaBetterSqlite3({ url: resolvedPath });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
