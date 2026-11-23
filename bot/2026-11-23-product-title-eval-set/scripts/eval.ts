import { readFileSync } from 'node:fs';
import { analyze } from '../lib/analysis';
import { loadFrozenData } from '../lib/dataset';

const { fixtures, freeze } = loadFrozenData();
const { rows, hits, misses, falsePositives, reordered, compliance, regressions } = analyze(fixtures);

console.log('Frozen', freeze);
console.log('Split', {
  dev: rows.filter(row => row.split === 'dev').length,
  holdout: rows.filter(row => row.split === 'holdout').length,
});
console.log('H1', {
  conclusion: misses.length + falsePositives.length === 0 ? '支持' : '不支持',
  hits: hits.map(row => [row.id, row.title, row.result.unsupported.join('、')]),
  misses: misses.map(row => [row.id, row.title]),
  falsePositives: falsePositives.map(row => [row.id, row.title]),
  reordered: reordered.map(row => [row.id, row.result.faithfulness]),
  supported: rows.filter(row => row.gold.faithfulness).length,
});

const markedOnly = compliance.filter(row => row.flag_absolute_terms && !row.compliance_should_fail);
const goldOnly = compliance.filter(row => !row.flag_absolute_terms && row.compliance_should_fail);
console.log('H2', {
  conclusion: markedOnly.length + goldOnly.length > 0 ? '支持' : '不支持',
  markedOnly: markedOnly.length,
  goldOnly: goldOnly.length,
  both: compliance.filter(row => row.flag_absolute_terms && row.compliance_should_fail).length,
  neither: compliance.filter(row => !row.flag_absolute_terms && !row.compliance_should_fail).length,
});
console.table(compliance.filter(row => row.slice !== 'ordinary'));

const h3 = readFileSync(new URL('../promptfoo/result.json', import.meta.url), 'utf8');
console.log('H3 已保存的对照结果（重新执行用 pnpm eval:promptfoo）');
console.log(h3.trimEnd());
console.log('生成 SKIPPED | LLM judge SKIPPED | H4 SKIPPED');
console.log('Hard gate', {
  pass: rows.filter(row => row.result.pass).length,
  fail: rows.filter(row => !row.result.pass).map(row => row.id),
  regressions: regressions.map(row => row.id),
});
if (regressions.length) process.exitCode = 1;
