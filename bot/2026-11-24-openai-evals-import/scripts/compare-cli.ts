import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dashboard, fixture } from './fixtures';
import { recompute } from './recompute';

type Recomputed = ReturnType<typeof recompute>;
type Result = Recomputed['results']['results'][number];
type Prompt = Recomputed['results']['prompts'][number];
type Exported = Recomputed & { config: Recomputed['config'] & { defaultTest?: unknown; assert?: unknown } };

function projection(exported: Exported): Recomputed {
  const { config, results } = exported;
  assert.equal(config.assert, undefined);
  assert.equal(config.defaultTest, undefined);
  return {
    evalId: exported.evalId,
    config: {
      description: config.description,
      tests: config.tests,
      metadata: config.metadata,
    },
    results: {
      prompts: results.prompts.map(({ raw, label, provider, metrics }: Prompt) => {
        const { testPassCount, testFailCount, testErrorCount, assertPassCount, assertFailCount } = metrics;
        return { raw, label, provider, metrics: { testPassCount, testFailCount, testErrorCount, assertPassCount, assertFailCount } };
      }),
      results: results.results.map((row: Result) => {
        const { promptIdx, testIdx, success, score, failureReason, error, gradingResult, namedScores } = row;
        assert.ok(row.metadata.openai.outputItem);
        return {
          promptIdx, testIdx, success, score, failureReason, namedScores,
          ...(error === undefined ? {} : { error }),
          gradingResult: {
            pass: gradingResult.pass,
            score: gradingResult.score,
            reason: gradingResult.reason,
            namedScores: gradingResult.namedScores,
            componentResults: gradingResult.componentResults.map(({ pass, score, reason, namedScores }) => ({
              pass, score, reason, ...(namedScores === undefined ? {} : { namedScores }),
            })),
          },
          metadata: { openai: { outputItem: row.metadata.openai.outputItem } },
        };
      }).sort((a, b) => a.promptIdx - b.promptIdx || a.testIdx - b.testIdx),
    },
  };
}

const root = fileURLToPath(new URL('..', import.meta.url));
const isolation = mkdtempSync(join(root, '.cli-'));
const home = join(isolation, 'home');
const cwd = join(isolation, 'work');
const configDir = join(home, '.promptfoo');
mkdirSync(home);
mkdirSync(cwd);

function cli(args: string[], expectedStatus: number) {
  const executable = join(root, 'node_modules', '.bin', 'promptfoo');
  const result = spawnSync(executable, args, {
    cwd,
    env: {
      PATH: process.env.PATH,
      NODE_ENV: 'production',
      HOME: home,
      XDG_CONFIG_HOME: join(home, 'config'),
      XDG_CACHE_HOME: join(home, 'cache'),
      XDG_DATA_HOME: join(home, 'data'),
      PROMPTFOO_CONFIG_DIR: configDir,
      PROMPTFOO_DISABLE_TELEMETRY: '1',
      PROMPTFOO_DISABLE_UPDATE: '1',
      NO_COLOR: '1',
    },
    encoding: 'utf8',
    timeout: 60_000,
  });
  console.log(JSON.stringify({ executable, args, cwd, home, status: result.status, stdout: result.stdout, stderr: result.stderr }));
  if (result.error) throw result.error;
  assert.equal(result.status, expectedStatus);
  return result.stdout;
}

try {
  const manifest = JSON.parse(readFileSync(join(root, 'node_modules/promptfoo/package.json'), 'utf8'));
  assert.equal(manifest.version, '0.126.0');
  assert.match(cli(['--version'], 0), /\b0\.126\.0\b/);
  for (const name of dashboard) {
    const independentlyComputed = recompute(fixture(name));
    cli(['import', join(root, 'fixtures', name)], 0);
    const target = join(cwd, 'export.json');
    cli(['export', 'eval', independentlyComputed.evalId, '--output', target], 0);
    const exported: Exported = JSON.parse(readFileSync(target, 'utf8'));
    assert.deepEqual(projection(exported), projection(independentlyComputed), name);
    console.log(`MATCH ${name} ${independentlyComputed.evalId}`);
  }
  assert.match(cli(['import', join(root, 'fixtures', 'invalid-row.jsonl')], 1), /line 2 is not a valid OpenAI Evals row/);
  assert.match(cli(['import', join(root, 'fixtures', 'api-like.json')], 1), /Unsupported eval export results format/);
} finally {
  rmSync(isolation, { recursive: true, force: true });
}
