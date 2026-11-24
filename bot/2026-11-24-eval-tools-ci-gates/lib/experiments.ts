import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suites } from '../fixtures/suites';
import { gate, groupTrials, rates, summarize, wilson, type Counts } from './statistics';

type ExportRow = {
  vars: { qid: string; trial: number; output: string };
  success: boolean;
  failureReason: number;
  provider: { id: string };
};

type TokenUsage = {
  prompt: number;
  completion: number;
  total: number;
  assertions: Omit<TokenUsage, 'assertions'>;
};

const expectedCounts = {
  h1: { successes: 28, failures: 2, errors: 0 },
  h2: { successes: 18, failures: 0, errors: 2 },
  'h3-control': { successes: 1, failures: 0, errors: 0 },
};

export function readExport(path: string, name: keyof typeof expectedCounts) {
  const { results: { stats, results } } = JSON.parse(readFileSync(path, 'utf8')) as {
    results: { stats: Counts & { tokenUsage: TokenUsage }; results: ExportRow[] };
  };
  const suite = suites[name === 'h3-control' ? 'h3' : name];
  const pending = new Map(suite.map(({ vars }) => [`${vars.qid}/${vars.trial}`, vars.output]));
  const counted = { successes: 0, failures: 0, errors: 0 };
  const provider = name === 'h2' ? 'offline-fixture' : 'echo';
  for (const row of results) {
    const key = `${row.vars.qid}/${row.vars.trial}`;
    const output = pending.get(key);
    const reason = output === 'error' ? 2 : output === 'fail' ? 1 : 0;
    if (!pending.delete(key) || row.vars.output !== output || row.provider.id !== provider ||
        row.failureReason !== reason || row.success !== (reason === 0)) {
      throw new Error(`${name}: 导出行与冻结夹具不符 (${key})`);
    }
    if (row.success) counted.successes++;
    else if (row.failureReason === 2) counted.errors++;
    else counted.failures++;
  }
  for (const key of ['successes', 'failures', 'errors'] as const) {
    if (stats[key] !== expectedCounts[name][key] || counted[key] !== stats[key] || pending.size) {
      throw new Error(`${name}: 计数 ${key} 与预期不符`);
    }
  }
  const { tokenUsage } = stats;
  for (const usage of [tokenUsage, tokenUsage.assertions]) {
    if ([usage.prompt, usage.completion, usage.total].some(value => value !== 0)) {
      throw new Error(`${name}: 预期 token 用量为零`);
    }
  }
  return { counted, results, tokenUsage };
}

type Exits = {
  h1: number;
  h2: number;
  control: number;
  h3: { version: string; exitCode: number; stdout: string; stderr: string; exported: boolean };
};

export function analyzeFixtures(root: string) {
  const dir = join(root, 'fixtures/exports');
  const exits = JSON.parse(readFileSync(join(dir, 'exits.json'), 'utf8')) as Exits;
  const { h3 } = exits;
  const accepted = !h3.stderr.startsWith("error: unknown option '--fail-on-error'\n");
  if (exits.h1 !== 100 || exits.h2 !== 100 || exits.control !== 0 || h3.version !== '0.126.0' ||
      h3.exitCode !== 1 || accepted || h3.exported || h3.stdout !== '') {
    throw new Error('CLI 实跑记录与预期不符');
  }
  const h1 = readExport(join(dir, 'h1.json'), 'h1');
  const h2 = readExport(join(dir, 'h2.json'), 'h2');
  readExport(join(dir, 'h3-control.json'), 'h3-control');
  const groups = groupTrials(h1.results.map(({ vars, success }) => ({
    qid: vars.qid, run: vars.trial, correct: success,
  })));
  const { passAt3, passAll3, single } = summarize(groups);
  const unstable = groups.filter(({ values }) => values.reduce((a, b) => a + b) === 1);
  if (unstable.length !== 1) throw new Error('H1 应恰有一题通过 1/3');
  const h2Rates = rates(h2.counted);
  return {
    version: h3.version,
    h1: {
      counts: h1.counted,
      cli: { rate: single, gate: gate(single), exitCode: exits.h1 },
      passAt3: { rate: passAt3, gate: gate(passAt3) },
      passAll3: { rate: passAll3, gate: gate(passAll3) },
      unstableQid: unstable[0].qid,
      wilsonControl: wilson(2, 3),
      wilson: wilson(1, 3),
      tokenTotal: h1.tokenUsage.total,
    },
    h2: {
      counts: h2.counted,
      ...h2Rates,
      cliGate: gate(h2Rates.cli),
      jqGate: gate(h2Rates.jq),
      exitCode: exits.h2,
      tokenTotal: h2.tokenUsage.total,
    },
    h3: { ...h3, accepted, controlExitCode: exits.control },
  };
}
