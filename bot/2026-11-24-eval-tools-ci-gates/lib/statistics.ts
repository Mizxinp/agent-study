export const threshold = 95;
export const gate = (rate: number) => rate * 100 < threshold ? '失败' : '通过';

export type Trial = { qid: string; run: number; correct: boolean };
export type Counts = { successes: number; failures: number; errors: number };

export function rates({ successes, failures, errors }: Counts) {
  return {
    cli: successes / (successes + failures + errors),
    jq: successes / (successes + failures),
  };
}

export function groupTrials(trials: readonly Trial[]) {
  const groups = new Map<string, Trial[]>();
  const sorted = [...trials].sort((a, b) =>
    a.qid === b.qid ? a.run - b.run : a.qid < b.qid ? -1 : 1);
  for (const trial of sorted) {
    const group = groups.get(trial.qid) ?? [];
    group.push(trial);
    groups.set(trial.qid, group);
  }
  return Array.from(groups, ([qid, group]) => {
    if (group.length !== 3 || group.some((trial, index) => trial.run !== index + 1)) {
      throw new Error(`题目 ${qid} 必须各有一次第 1、2、3 轮`);
    }
    return { qid, values: group.map(trial => Number(trial.correct)) };
  });
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

export function summarize(groups: ReturnType<typeof groupTrials>) {
  const byTrial = groups.flatMap(({ values }) => values);
  const byQuestion = groups.map(({ values }) => mean(values));
  return {
    trials: byTrial.length,
    questions: groups.length,
    single: mean(byTrial),
    passAt3: mean(byQuestion.map(rate => Number(rate > 0))),
    passAll3: mean(byQuestion.map(rate => Number(rate === 1))),
    byTrial,
    byQuestion,
  };
}

export function bootstrap(values: readonly number[]) {
  let state = 20261121;
  function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  }
  const means = Array.from({ length: 10_000 }, () => {
    let sum = 0;
    for (let draw = 0; draw < values.length; draw++) {
      sum += values[Math.floor(random() * values.length)];
    }
    return sum / values.length;
  }).sort((a, b) => a - b);

  function quantile(p: number) {
    const position = (means.length - 1) * p;
    const index = Math.floor(position);
    return means[index] + (means[Math.ceil(position)] - means[index]) * (position - index);
  }

  const lower = quantile(0.025);
  const upper = quantile(0.975);
  return { lower, upper, width: upper - lower };
}

const WILSON_Z_95 = 1.959963984540054;

export function wilson(successes: number, trials: number) {
  const p = successes / trials;
  const z2 = WILSON_Z_95 ** 2;
  const denominator = 1 + z2 / trials;
  const center = (p + z2 / (2 * trials)) / denominator;
  const margin = WILSON_Z_95 * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials) / denominator;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export const four = (value: number) => value.toFixed(4);
