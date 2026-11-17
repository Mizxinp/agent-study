import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { runProviderExperiment, type ExperimentConfig } from "./experiment";
import { hasAnyProviderKey, missingKeyNames } from "./keys";
import { selectProviders } from "./providers";
import { formatResultsMarkdown } from "./report";
import { missingKeyMessage } from "./types";

export type EvalOutcome =
  | { ok: false; status: "missing-keys"; missing: string[]; message: string }
  | { ok: true; status: "ran"; resultsPath: string; reportPath: string; summary: string };

export async function runEval(options: { cwd?: string; config?: ExperimentConfig } = {}): Promise<EvalOutcome> {
  if (!hasAnyProviderKey()) {
    return {
      ok: false,
      status: "missing-keys",
      missing: missingKeyNames(),
      message: missingKeyMessage,
    };
  }

  const providers = selectProviders();
  const runs = [];
  for (const provider of providers) {
    runs.push(await runProviderExperiment(provider, options.config));
  }

  const cwd = options.cwd ?? process.cwd();
  const resultsPath = resolve(cwd, "results.json");
  const reportPath = resolve(cwd, "results.md");
  writeFileSync(
    resultsPath,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), runs }, null, 2)}\n`,
  );
  const report = formatResultsMarkdown(runs, {
    node: process.version,
    pnpm: process.env.npm_config_user_agent ?? "pnpm",
    generatedAt: new Date().toISOString(),
  });
  writeFileSync(reportPath, `${report}\n`);
  return {
    ok: true,
    status: "ran",
    resultsPath,
    reportPath,
    summary: report,
  };
}
