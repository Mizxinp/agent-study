import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { bootstrap, four, groupTrials, summarize, type Trial } from './statistics';

export const provenance = {
  base: '37bc3eefe3536fe2cb70b94ff1ee5dd3eab481b7',
  introduced: 'f6f5d160777acc6cf77034b845105fdf3eb068ad',
  sha256: '067821e5a441e8a9f15292faf06c9d5e2a38b30ad145400b927a5f89a530aa5f',
  blob: 'fd761b71959e7bfdf7f5728c9d074aca3b7abed0',
};

export function verifyFrozen(bytes: Buffer) {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (sha256 !== provenance.sha256 || blob !== provenance.blob) {
    throw new Error(`2.3 冻结文件哈希不符 (SHA-256 ${sha256}, Git blob ${blob})`);
  }
  return { sha256, blob };
}

export const reference = {
  'all/fixed': ['0.7667', '0.8000', '0.7250', '0.1500', '0.2417'],
  'multi/fixed': ['0.4048', '0.4286', '0.3571', '0.2857', '0.4762'],
};

type Row = Trial & { type: string; pipeline: string };

export function analyzeFrozen(root: string) {
  const bytes = readFileSync(`${root}/data/results.json`);
  const source = readFileSync(`${root}/../2026-11-18-agentic-rag-loop/results.json`);
  const hashes = verifyFrozen(bytes);
  verifyFrozen(source);
  if (!bytes.equals(source)) throw new Error('源文件与副本字节不一致');

  const { rows } = JSON.parse(bytes.toString()) as { rows: Row[] };
  const fixed = rows.filter(row => row.pipeline === 'fixed');
  const slices = Object.entries({
    'all/fixed': fixed,
    'multi/fixed': fixed.filter(row => row.type === 'multi'),
  }).map(([slice, rows]) => {
    const { trials, questions, single, passAt3, passAll3, byTrial, byQuestion } =
      summarize(groupTrials(rows));
    const trialInterval = bootstrap(byTrial);
    const questionInterval = bootstrap(byQuestion);
    const actual = [single, passAt3, passAll3, trialInterval.width, questionInterval.width].map(four);
    const expected = reference[slice as keyof typeof reference];
    return {
      slice, trials, questions, single, passAt3, passAll3, trialInterval, questionInterval,
      actual, expected, matches: actual.every((value, index) => value === expected[index]),
    };
  });

  return { hashes, slices };
}
