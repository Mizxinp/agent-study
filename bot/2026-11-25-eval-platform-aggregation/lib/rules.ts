type Example = { id: string };
type TrialCase = Example & { trialCount?: number | null };
export type ResultRow = { example: Example; score: number; trialIndex: number };

export function expandLangSmith<T extends Example>(examples: readonly T[], repetitions?: number) {
  const rounds = repetitions && repetitions > 0 ? repetitions : 1;
  const repeated: T[] = [];
  for (let round = 0; round < rounds; round++) {
    for (const example of examples) repeated.push(example);
  }
  return repeated;
}

export function expandBraintrust(cases: readonly TrialCase[], globalTrialCount?: number | null) {
  const rows: { id: string; trialIndex: number }[] = [];
  for (const datum of cases) {
    const count = datum.trialCount ?? globalTrialCount ?? 1;
    for (let trialIndex = 0; trialIndex < count; trialIndex++) {
      rows.push({ id: datum.id, trialIndex });
    }
  }
  return rows;
}

export function rowMean(rows: readonly ResultRow[]) {
  return rows.reduce((total, row) => total + row.score, 0) / rows.length;
}

export function questionMetrics(rows: readonly ResultRow[], k: number) {
  if (!Number.isInteger(k) || k < 1 || rows.length === 0) {
    throw new Error('需要正整数 k 和非空结果');
  }
  const byId = new Map<string, Map<number, number>>();
  for (const { example, trialIndex, score } of rows) {
    if (!byId.has(example.id)) byId.set(example.id, new Map());
    const trials = byId.get(example.id)!;
    if (!Number.isInteger(trialIndex) || trialIndex < 0 || trialIndex >= k ||
        trials.has(trialIndex) || (score !== 0 && score !== 1)) {
      throw new Error(`无效或重复的 trial：${example.id}/${trialIndex}`);
    }
    trials.set(trialIndex, score);
  }

  let anyCorrect = 0;
  let allCorrect = 0;
  for (const [id, trials] of byId) {
    if (trials.size !== k) throw new Error(`${id} 缺少 trial`);
    const correct = [...trials.values()].filter((score) => score === 1).length;
    if (correct > 0) anyCorrect++;
    if (correct === k) allCorrect++;
  }

  return { questionCount: byId.size, passAtK: anyCorrect / byId.size, passPowerK: allCorrect / byId.size };
}

export function reportEval(rows: readonly { score: number; error?: unknown }[]) {
  return rows.every(({ error }) => error === undefined);
}

export function reportRun(evalReports: readonly boolean[]) {
  return evalReports.every((passed) => passed);
}
