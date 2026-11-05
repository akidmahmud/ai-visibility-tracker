// Extraction eval (handoff §8): precision/recall on recommended entity names and rank accuracy against
// hand-labeled answers in eval/answers. Uses the LLM from EXTRACTION_MODEL when its key is set, otherwise
// reports the deterministic (known-entities-only) baseline. `--check` exits 1 below the launch targets.
import { readdirSync, readFileSync } from "node:fs";
import { jaroWinkler, normalizeName } from "@avt/shared";
import extraction from "../dist/index.js";

const { extractMentions, extractorFromEnv } = extraction;
try {
  process.loadEnvFile("../../.env");
} catch {}

const TARGET = { precision: 0.95, recall: 0.9 };
const dir = new URL("./answers/", import.meta.url);
const known = JSON.parse(readFileSync(new URL("./known.json", import.meta.url), "utf8"));
const llm = extractorFromEnv();

const names = (e) => (typeof e === "string" ? [e] : [e.name, ...(e.aliases ?? [])]).map(normalizeName);
const same = (predicted, expected) => {
  const p = normalizeName(predicted);
  return names(expected).some((n) => n === p || jaroWinkler(n, p) >= 0.93);
};

let tp = 0, predictedTotal = 0, expectedTotal = 0, rankHits = 0;
const rows = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const a = JSON.parse(readFileSync(new URL(file, dir), "utf8"));
  const out = await extractMentions({ text: a.text, known: known[a.industry] ?? [], citations: [] }, llm);
  const predicted = out.filter((m) => m.rank > 0).map((m) => m.name);
  const matched = predicted.map((p) => a.expected.findIndex((e) => same(p, e)));
  const hits = new Set(matched.filter((i) => i >= 0));
  const ranksRight = matched.filter((i, rank) => i >= 0 && i === rank).length;

  tp += hits.size;
  predictedTotal += predicted.length;
  expectedTotal += a.expected.length;
  rankHits += ranksRight;
  const missed = a.expected.filter((_, i) => !hits.has(i)).map((e) => (typeof e === "string" ? e : e.name));
  const extra = predicted.filter((_, i) => matched[i] < 0);
  rows.push(`${file.padEnd(32)} found ${hits.size}/${a.expected.length}  extra ${extra.length}${missed.length ? `  missed: ${missed.join(", ")}` : ""}${extra.length ? `  extra: ${extra.join(", ")}` : ""}`);
}

const precision = predictedTotal ? tp / predictedTotal : 0;
const recall = expectedTotal ? tp / expectedTotal : 0;
console.log(`extractor: ${llm ? process.env.EXTRACTION_MODEL || "gemini-2.5-flash-lite" : "none (known entities only)"}\n`);
console.log(rows.join("\n"));
console.log(`\n${rows.length} answers · precision ${(precision * 100).toFixed(1)}% · recall ${(recall * 100).toFixed(1)}% · rank accuracy ${tp ? ((rankHits / tp) * 100).toFixed(1) : "–"}%`);
console.log(`targets: precision ≥ ${TARGET.precision * 100}%, recall ≥ ${TARGET.recall * 100}% (needs 100 labeled answers across 5 engines and 3+ industries before launch)`);
if (process.argv.includes("--check") && (precision < TARGET.precision || recall < TARGET.recall)) process.exit(1);
