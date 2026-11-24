import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { analyzeFixtures } from '../lib/experiments';
import { analyzeFrozen, provenance } from '../lib/frozen';
import { four } from '../lib/statistics';

const root = fileURLToPath(new URL('../', import.meta.url));
const { version, h1, h2, h3 } = analyzeFixtures(root);
const h4 = analyzeFrozen(root);
const jqCommand = '.results.stats.successes / (.results.stats.successes + .results.stats.failures) * 100';
const jqPercent = Number(execFileSync('jq', [jqCommand, 'fixtures/exports/h2.json'], {
  cwd: root, encoding: 'utf8',
}).trim());
if (jqPercent !== h2.jq * 100) throw new Error('jq 与 TypeScript 重算不一致');

console.log('2.3 数据核验通过（源文件和副本字节相同）', { ...provenance, ...h4.hashes });
console.log(`Promptfoo ${version} · 95% 闸门`);
console.log('H1', { ...h1, wilsonControl: h1.wilsonControl.map(four), wilson: h1.wilson.map(four) });
console.log('H2', { ...h2, jqPercent });
console.log('H3', {
  accepted: h3.accepted,
  exitCode: h3.exitCode,
  controlExitCode: h3.controlExitCode,
  stdout: h3.stdout,
  stderrFirstLine: h3.stderr.split('\n')[0],
});
for (const row of h4.slices) {
  const interval = ({ lower, upper, width }: typeof row.trialInterval) =>
    `[${four(lower)}, ${four(upper)}]，宽度 ${four(width)}`;
  console.log(`H4 ${row.slice} (${row.questions} 题 / ${row.trials} 次)`, {
    单次: four(row.single),
    'pass@3': four(row.passAt3),
    'pass^3': four(row.passAll3),
    按trial: interval(row.trialInterval),
    按题: interval(row.questionInterval),
    '3.1 对照': row.matches ? '逐项一致' : { actual: row.actual, expected: row.expected },
  });
}
if (h4.slices.some(row => !row.matches)) process.exitCode = 1;
