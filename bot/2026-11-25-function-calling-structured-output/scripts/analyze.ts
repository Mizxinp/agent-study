import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { asSchema } from 'ai';
import { fixtures } from '../fixtures/schemas';
import { experiments, runExperiment, type Hypothesis } from '../lib/experiments';
import { models } from '../lib/offline';

const fixtureHashes: Record<string, string> = {};
for (const [name, fixture] of Object.entries(fixtures)) {
  const schema = await asSchema<unknown>(fixture).jsonSchema;
  const contents = JSON.stringify(schema, null, 2) + '\n';
  const file = `fixtures/${name}.json`;
  await writeFile(new URL(`../${file}`, import.meta.url), contents);
  fixtureHashes[file] = createHash('sha256').update(contents).digest('hex');
}

const results = await Promise.all((Object.keys(experiments) as Hypothesis[]).map(runExperiment));
const summary = {
  models,
  fixtureHashes,
  results,
  typecheck: { H7: 'repairText 由 lib/repair-text.typecheck.ts 的 @ts-expect-error 执行类型回归检查' },
  live: { id: 'H9', verdict: '跳过', reason: '本轮缺少模型 API 密钥，真实服务端验证关闭' },
};
await writeFile(new URL('../results/summary.json', import.meta.url), JSON.stringify(summary, null, 2) + '\n');
console.table(results.map(({ id, verdict, requestCount, assertions, passed, error }) =>
  ({ 假设: id, 结论: verdict, 截获请求: requestCount, 断言: assertions, 通过: passed, ...(error && { 错误: error }) })));
console.log('H9 跳过。本次分析已写入 results/summary.json');
if (results.some(result => result.verdict === '不确定')) process.exitCode = 1;
