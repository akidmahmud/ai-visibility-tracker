import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: "../../.env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` never connects, and CI/Render/Vercel builds run it without DATABASE_URL (Turbo strips undeclared env);
  // migrate commands run at start-up where the real URL is set.
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://build:build@localhost:5432/build" },
});
