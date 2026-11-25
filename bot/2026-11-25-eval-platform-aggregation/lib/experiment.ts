import expansion from '../data/expansion.json';
import stability from '../data/stability.json';
import reporter from '../data/reporter.json';
import { expandBraintrust, expandLangSmith, questionMetrics, reportEval, reportRun, rowMean } from './rules';

export function analyze() {
  const langSmith = expansion.langSmith.map(({ examples, numRepetitions }) => {
    const rows = expandLangSmith(examples, numRepetitions);
    const counts = new Map<string, number>();
    for (const { id } of rows) counts.set(id, (counts.get(id) ?? 0) + 1);
    return { examples: examples.length, numRepetitions, rowCount: rows.length, counts: Object.fromEntries(counts) };
  });

  const { k, threshold, questions } = stability;
  if (new Set(questions.map(({ qid }) => qid)).size !== questions.length ||
      questions.some(({ scores }) => scores.length !== k)) {
    throw new Error('夹具必须包含唯一 qid，且每题恰有 k 个分数');
  }
  const examples = questions.map(({ qid, scores }) => ({ id: qid, scores }));
  const rows = expandLangSmith(examples, k).map((example, index) => {
    const trialIndex = Math.floor(index / examples.length);
    return { example, trialIndex, score: example.scores[trialIndex] };
  });
  const mean = rowMean(rows);
  const grouped = questionMetrics(rows, k);

  const trialRows = expandBraintrust(expansion.braintrust.cases, expansion.braintrust.trialCount);
  const indices = expansion.braintrust.cases.map(({ id }) => ({
    id, trialIndices: trialRows.filter((row) => row.id === id).map((row) => row.trialIndex),
  }));

  const lowScores = reportEval(reporter.lowScores);
  const withError = reportEval(reporter.withError);

  return {
    H1: langSmith,
    H2: { k, threshold, rowCount: rows.length, mean, ...grouped,
      rowGate: mean >= threshold, stabilityGate: grouped.passPowerK >= threshold },
    H3: { rowCount: trialRows.length, cases: indices },
    H4: { naiveSummary: rows.filter(({ score }) => score === 1).length / rows.length, ...grouped },
    H5: { lowScores, withError, allSuccessfulRun: reportRun([lowScores, lowScores]),
      mixedRun: reportRun([lowScores, withError]) },
  };
}
