import { defineConfig } from "vitest/config";

try {
  process.loadEnvFile("../../.env");
} catch {
  // CI provides env directly
}
// tests write brands and prompts; keep them out of the dev DB, where the scheduler would run them for real
if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

export default defineConfig({ test: { include: ["test/**/*.test.ts"], testTimeout: 60_000 } });
// tests never call paid or rate-limited AI services
for (const k of ["OPENROUTER_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "PERPLEXITY_API_KEY"]) delete process.env[k];
