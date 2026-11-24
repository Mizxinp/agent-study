import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gradeFixture, loadFrozenData } from '../lib/dataset';

const { fixtures, freeze } = loadFrozenData();
const fixture = fixtures.find(row => row.id === 'PT-02');
if (!fixture) throw new Error('Missing H3 fixture PT-02');
const { id, title, attributes, required, maxChars, gold } = fixture;
const result = gradeFixture(fixture);
const local = { datasetSha256: freeze.sha256, id, title, ...result };

const packageDir = fileURLToPath(new URL('../node_modules/promptfoo/', import.meta.url));
const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
if (pkg.version !== '0.126.0') throw new Error(`Unexpected Promptfoo version: ${pkg.version}`);

const cache = fileURLToPath(new URL('../.promptfoo/', import.meta.url));
mkdirSync(cache, { recursive: true });
const runDir = mkdtempSync(join(cache, 'h3-'));
const exportDir = process.argv[2] ? resolve(process.argv[2]) : runDir;
mkdirSync(exportDir, { recursive: true });
const cliExport = join(exportDir, 'promptfoo-export.json');
const localExport = join(exportDir, 'typescript-export.json');
writeFileSync(localExport, JSON.stringify(local, null, 2) + '\n');

const grader = fileURLToPath(new URL('../lib/grader.ts', import.meta.url));
const input = { attributes, required, maxChars, compliance_should_fail: gold.compliance_should_fail };
const assert = Object.entries({ faithfulness: 1, coverage: 2, length: 2 }).map(([metric, weight]) => {
  const path = join(runDir, `${metric}.cjs`);
  writeFileSync(path, `const { gradeTitle } = require(${JSON.stringify(grader)});
module.exports = output => {
  const pass = gradeTitle({ ...${JSON.stringify(input)}, title: output })[${JSON.stringify(metric)}];
  return { pass, score: Number(pass), reason: ${JSON.stringify(metric)} };
};
`);
  return { type: 'javascript', value: `file://${path}`, metric, weight };
});

const threshold = 0.75;
const config = join(runDir, 'promptfooconfig.json');
writeFileSync(config, JSON.stringify({
  prompts: ['{{title}}'],
  providers: ['echo'],
  tests: [{ description: id, vars: { title }, threshold, assert }],
}));

// Start in a new directory with no dotenv files and an isolated home.
const cli = join(packageDir, pkg.bin.promptfoo);
const executed = spawnSync(process.execPath, [
  cli, 'eval', '-c', config, '-o', cliExport,
  '--no-cache', '--no-share', '--no-write', '--no-progress-bar',
], {
  cwd: runDir,
  env: {
    PATH: process.env.PATH,
    HOME: runDir,
    CI: '1',
    NODE_ENV: 'production',
    PROMPTFOO_DISABLE_TELEMETRY: '1',
    PROMPTFOO_DISABLE_UPDATE: '1',
  },
  stdio: 'inherit',
});
if (executed.status !== 0) {
  throw new Error(`Promptfoo exit ${executed.status ?? executed.signal}: ${executed.error ?? ''}`);
}

const exported = JSON.parse(readFileSync(cliExport, 'utf8'));
const [row] = exported.results.results;
const assertions = row.gradingResult.componentResults.map(
  ({ pass, score, reason }: { pass: boolean; score: number; reason: string }) => ({
    metric: reason,
    pass,
    score,
    weight: assert.find(assertion => assertion.metric === reason)?.weight,
  }),
);
const observed = {
  conclusion: '支持',
  typescript: local,
  promptfoo: {
    version: pkg.version, provider: row.provider.id, output: row.response.output,
    threshold: row.testCase.threshold, success: row.success, score: row.score,
    reason: row.gradingResult.reason, assertions,
  },
};
if (
  result.pass || result.faithfulness || row.response.output !== title ||
  row.provider.id !== 'echo' || row.testCase.threshold !== threshold ||
  row.success !== true || row.score <= threshold ||
  !assertions.some((item: { metric: string; pass: boolean; score: number }) =>
    item.metric === 'faithfulness' && item.pass === false && item.score === 0)
) {
  throw new Error(`Unexpected H3 observation: ${JSON.stringify(observed)}`);
}

const summary = JSON.stringify(observed, null, 2) + '\n';
writeFileSync(join(exportDir, 'promptfoo-summary.json'), summary);
console.log(summary);
