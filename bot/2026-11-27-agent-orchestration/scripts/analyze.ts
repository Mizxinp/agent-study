import { mkdir, writeFile } from 'node:fs/promises';
import { h1, h2, h3, h4, h5 } from '../lib/handoffs';
import { h6, h7 } from '../lib/resume';
import { h8, h9 } from '../lib/ai-sdk';
import { buildObservation, h10 } from '../lib/http-experiment';
import type { Observation } from '../lib/results';

const trace: unknown[] = [];
const results: Observation[] = [
  ...await h1(trace), ...await h2(), ...await h3(), ...await h4(), ...await h5(), ...await h6(trace),
  ...await h7(), ...await h8(), ...await h9(), ...await h10(),
];
await mkdir('results', { recursive: true });
const save = (file: string, value: unknown) => writeFile('results/' + file, JSON.stringify(value, null, 2) + '\n');
await save('summary.json', results);
await save('trace.sample.json', trace);
const build = buildObservation();
results.push(build);
await save('summary.json', results);
console.table(results.map(({ id, conclusion, data }) => ({ 实验: id, 结论: conclusion, 实测: JSON.stringify(data) })));
if (build.data.exitCode !== 0) process.exitCode = 1;
