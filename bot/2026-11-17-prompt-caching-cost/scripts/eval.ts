import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runEval } from "../lib/eval-runner";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TARGET_PREFIX_TOKENS } from "../lib/prices";

const envPath = resolve(process.cwd(), ".env");
if (existsSync(envPath) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envPath);
}

const outcome = await runEval({
  config: {
    targetPrefixTokens: Number(process.env.TARGET_PREFIX_TOKENS) || DEFAULT_TARGET_PREFIX_TOKENS,
    maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS) || DEFAULT_MAX_OUTPUT_TOKENS,
    prewarm: process.env.EVAL_PREWARM === "1" || process.env.EVAL_PREWARM === "true",
  },
});

if (!outcome.ok) {
  console.error(outcome.message);
  console.error(`缺少的环境变量：${outcome.missing.join("、")}`);
  process.exit(1);
}

console.log(`Wrote ${outcome.resultsPath}`);
console.log(`Wrote ${outcome.reportPath}`);
console.log(outcome.summary);
