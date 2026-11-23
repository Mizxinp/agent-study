export const slices = ["single", "multi", "null", "all"] as const;
export const pipelines = ["fixed", "agentic"] as const;
export const runs = [1, 2, 3] as const;
export const BOOTSTRAP_SEED = 20261121;
export const BOOTSTRAP_REPLICATES = 10_000;
export const JUDGE_STATUS = "SKIPPED";

export type Slice = (typeof slices)[number];
export type Pipeline = (typeof pipelines)[number];
export type Row = {
  qid: string;
  type: Exclude<Slice, "all">;
  pipeline: Pipeline;
  run: number;
  correct: boolean;
  gold: string[];
  answer: string[] | null;
  rationale: string | null;
};

type Question = {
  qid: string;
  type: Row["type"];
  trials: Record<Pipeline, boolean[]>;
};

export function questionsFromRows(rows: readonly Row[]): Question[] {
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const group = grouped.get(row.qid) ?? [];
    group.push(row);
    grouped.set(row.qid, group);
  }
  return Array.from(grouped, ([qid, group]) => {
    const type = group[0].type;
    if (group.length !== pipelines.length * runs.length || group.some(row => row.type !== type)) {
      throw new Error(`题目 ${qid} 的 trial 数或题型不符`);
    }
    function getTrials(pipeline: Pipeline) {
      return runs.map(run => {
        const matches = group.filter(row => row.pipeline === pipeline && row.run === run);
        if (matches.length !== 1) throw new Error(`题目 ${qid} 缺少唯一的 ${pipeline} 第 ${run} 轮`);
        return matches[0].correct;
      });
    }
    return { qid, type, trials: { fixed: getTrials("fixed"), agentic: getTrials("agentic") } };
  }).sort((a, b) => a.qid < b.qid ? -1 : a.qid > b.qid ? 1 : 0);
}

function mean(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function trialMetrics(trials: readonly boolean[]) {
  return {
    accuracy: mean(trials.map(Number)),
    passAt3: trials.some(Boolean),
    passAll3: trials.every(Boolean),
  };
}

export function summarize(questions: readonly Question[], pipeline: Pipeline) {
  const trials = questions.map(question => question.trials[pipeline]);
  const metrics = trials.map(trialMetrics);
  return {
    n: trials.length * runs.length,
    accuracy: mean(trials.flat().map(Number)),
    passAt3: mean(metrics.map(metric => Number(metric.passAt3))),
    passAll3: mean(metrics.map(metric => Number(metric.passAll3))),
  };
}

// Mulberry32, with the state advanced modulo 2^32 on each draw.
function randomFromSeed(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

function percentile(sorted: readonly number[], fraction: number) {
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
}

function bootstrap(values: readonly number[]) {
  const random = randomFromSeed(BOOTSTRAP_SEED);
  const means = Array.from({ length: BOOTSTRAP_REPLICATES }, () => {
    let sum = 0;
    for (let draw = 0; draw < values.length; draw++) {
      sum += values[Math.floor(random() * values.length)];
    }
    return sum / values.length;
  }).sort((a, b) => a - b);
  const lower = percentile(means, 0.025);
  const upper = percentile(means, 0.975);
  return { estimate: mean(values), lower, upper, width: upper - lower };
}

export function intervals(questions: readonly Question[], pipeline: Pipeline) {
  const trials = questions.map(question => question.trials[pipeline]);
  return {
    byTrial: bootstrap(trials.flat().map(Number)),
    byQuestion: bootstrap(trials.map(trial => trialMetrics(trial).accuracy)),
  };
}

export function inspectRationales(rows: readonly Row[]) {
  const eligible = rows.filter(row => row.pipeline === "agentic" && row.correct);
  const hits = eligible.flatMap(({ qid, run, rationale, gold, answer }) => {
    const excerpt = rationale?.trim() ?? "";
    const mentions = new Set(excerpt.match(/(?<![A-Za-z0-9-])DH-[A-Z]{2}-\d{4}(?![A-Za-z0-9-])/g));
    const outsideGold = [...mentions].filter(sku => !gold.includes(sku));
    const empty = excerpt.length === 0;
    // A nonempty answer conflicts with an explicit global claim of no matching products.
    const contradiction = Boolean(answer?.length) &&
      /(?:没有|无|未找到)(?:任何)?符合(?:全部)?条件的商品/.test(excerpt);
    return outsideGold.length || empty || contradiction
      ? [{ qid, run, outsideGold, empty, contradiction, excerpt }]
      : [];
  });
  return { checked: eligible.length, hits };
}

function signTest(differences: readonly number[]) {
  const agenticWins = differences.filter(value => value > 0).length;
  const fixedWins = differences.filter(value => value < 0).length;
  const nonTies = agenticWins + fixedWins;
  const tail = Math.min(agenticWins, fixedWins);
  let mass = 2 ** -nonTies;
  let cumulative = mass;
  for (let k = 1; k <= tail; k++) {
    mass *= (nonTies - k + 1) / k;
    cumulative += mass;
  }
  return {
    n: differences.length,
    agenticWins,
    fixedWins,
    ties: differences.length - nonTies,
    p: Math.min(1, 2 * cumulative),
  };
}

export function pairedTests(questions: readonly Question[]) {
  const differences = questions.map(({ trials }) =>
    runs.map((_, index) => Number(trials.agentic[index]) - Number(trials.fixed[index])));
  return {
    byQuestion: signTest(differences.map(values => values.reduce((sum, value) => sum + value, 0))),
    byTrial: signTest(differences.flat()),
  };
}

export const four = (value: number) => value.toFixed(4);
