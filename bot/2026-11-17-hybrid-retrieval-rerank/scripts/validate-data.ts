import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { buildChunks, CHUNK_MAX_CHARS, hasProductName, type ProductDoc, type Chunk } from '../lib/chunk.js';
type LabeledChunk = Chunk & { hasProductName: boolean };
type Query = { id: string; type: 'exact' | 'paraphrase' | 'anaphora'; query: string; relevant: string[]; note: string };
const read = async (name: string) => JSON.parse(await readFile(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const docs: ProductDoc[] = await read('docs');
const chunks: LabeledChunk[] = await read('chunks');
const data: { finalizedAt: string; labelPolicy: string; queries: Query[] } = await read('queries');
assert.equal(docs.length, 16);
assert.match(data.finalizedAt, /\+08:00$/);
assert.ok(data.labelPolicy.length > 0);
const sectionNames = ['材质与釉色', '规格参数', '工艺', '使用与清洗', '售后', '概述'];
const modelPattern = /DH-[A-Z]{2}-\d{4}/;
assert.equal(new Set(docs.map(d => d.model)).size, 16);
for (const doc of docs) {
  assert.match(doc.model, /^DH-[A-Z]{2}-\d{4}$/);
  assert.deepEqual(doc.sections.map(s => s.title), sectionNames);
  let anonymous = 0;
  for (const section of doc.sections) {
    const han = section.text.match(/\p{Script=Han}/gu)?.length ?? 0;
    assert.ok(han >= 120 && han <= 260, `${doc.id}/${section.title}: ${han} 汉字`);
    if (!['概述', '规格参数'].includes(section.title)) assert.ok(!modelPattern.test(section.text));
    if (section.title !== '概述' && !hasProductName(section.text, doc)) anonymous++;
  }
  assert.ok(anonymous >= 3);
}
assert.deepEqual(chunks, buildChunks(docs).map(c => ({ ...c, hasProductName: hasProductName(c.text, c) })), '分块文件应与当前文档一致');
assert.ok(chunks.length >= 70 && chunks.length <= 120);
const byId = new Map(chunks.map(c => [c.id, c]));
assert.equal(byId.size, chunks.length);
for (const c of chunks) assert.ok(Array.from(c.text).length <= CHUNK_MAX_CHARS);
assert.equal(new Set(data.queries.map(q => q.id)).size, data.queries.length);
const counts = { exact: 0, paraphrase: 0, anaphora: 0 };
let exactWithModel = 0;
for (const q of data.queries) {
  assert.ok(q.type in counts); counts[q.type]++;
  assert.ok(q.relevant.length > 0 && q.note.length > 0);
  const related = q.relevant.map(id => { const c = byId.get(id); assert.ok(c, `${q.id}: 不存在 ${id}`); return c; });
  if (q.type === 'exact') {
    const model = q.query.match(modelPattern)?.[0]; assert.ok(model, q.id);
    assert.ok(related.every(c => c.model === model));
    if (related.some(c => c.text.includes(model))) exactWithModel++;
  }
  if (q.type === 'anaphora') {
    assert.ok(related.every(c => !c.hasProductName), q.id);
    assert.ok(related.every(c => q.query.includes(c.title)), q.id);
  }
  if (q.type === 'paraphrase') {
    assert.ok(!modelPattern.test(q.query), q.id);
    // 枚举所有长度至少三字的连续公共子串，仅打印最长者，避免子串重复刷屏。
    const shared = new Set<string>();
    const chars = Array.from(q.query);
    for (let i = 0; i < chars.length; i++) for (let j = i + 3; j <= chars.length; j++) {
      const s = chars.slice(i, j).join('');
      if (/^[\p{Script=Han}]+$/u.test(s) && related.some(c => c.text.includes(s))) shared.add(s);
    }
    const maximal = [...shared].filter(s => ![...shared].some(t => t !== s && t.includes(s)));
    console.log(`${q.id} 共享≥3字子串：${maximal.join('、') || '无'}`);
  }
}
for (const count of Object.values(counts)) assert.ok(count >= 15);
assert.ok(exactWithModel >= 10, 'exact 至少10条的答案块须含查询型号');
console.log(`校验通过：${JSON.stringify(counts)}；exact 答案含型号 ${exactWithModel} 条；块数 ${chunks.length}；平均块长 ${(chunks.reduce((s, c) => s + Array.from(c.text).length, 0) / chunks.length).toFixed(2)}`);
