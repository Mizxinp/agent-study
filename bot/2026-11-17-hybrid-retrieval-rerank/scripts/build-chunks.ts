import { readFile, writeFile } from 'node:fs/promises';
import { buildChunks, hasProductName, type ProductDoc } from '../lib/chunk.js';
const docs: ProductDoc[] = JSON.parse(await readFile(new URL('../data/docs.json', import.meta.url), 'utf8'));
const chunks = buildChunks(docs).map(chunk => ({ ...chunk, hasProductName: hasProductName(chunk.text, chunk) }));
await writeFile(new URL('../data/chunks.json', import.meta.url), JSON.stringify(chunks, null, 2) + '\n');
console.log(`块数 ${chunks.length}，平均块长 ${(chunks.reduce((sum, c) => sum + Array.from(c.text).length, 0) / chunks.length).toFixed(2)} 字符`);
