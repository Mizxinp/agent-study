import { readFileSync } from 'node:fs';

export const dashboard = [
  'openai-evals-items.jsonl',
  'openai-evals-multi-run-items.jsonl',
  'score-only.jsonl',
  'alignment.jsonl',
] as const;

export function fixture(name: string) {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
}
