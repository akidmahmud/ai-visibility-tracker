import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export * from "./generated/client";

export function createPrisma(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not set");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
