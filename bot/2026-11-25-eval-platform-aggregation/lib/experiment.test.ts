import { describe, expect, it } from 'vitest';
import { analyze } from './experiment';
import { expandBraintrust, expandLangSmith, questionMetrics, reportEval } from './rules';

const results = analyze();

describe('冻结结果', () => {
  it('H1 按完整批次展开且保留原样本', () => {
    expect(results.H1).toEqual([
      { examples: 5, numRepetitions: 5, rowCount: 25, counts: { e1: 5, e2: 5, e3: 5, e4: 5, e5: 5 } },
      { examples: 2, numRepetitions: 3, rowCount: 6, counts: { e1: 3, e2: 3 } },
    ]);
    const a = { id: 'a' };
    const b = { id: 'b' };
    const rows = expandLangSmith([a, b], 2);
    expect(rows.map(({ id }) => id)).toEqual(['a', 'b', 'a', 'b']);
    expect(rows[2]).toBe(a);
  });

  it('H2 行级均值通过 0.85，题级全对率未通过', () => {
    expect(results.H2).toEqual({ k: 3, threshold: 0.85, rowCount: 60, questionCount: 20,
      mean: 56 / 60, passAtK: 1, passPowerK: 16 / 20, rowGate: true, stabilityGate: false });
  });

  it('H3 单题次数优先，并保留从 0 开始的索引', () => {
    expect(results.H3).toEqual({ rowCount: 8, cases: [
      { id: 'default', trialIndices: [0, 1] },
      { id: 'override-five', trialIndices: [0, 1, 2, 3, 4] },
      { id: 'override-one', trialIndices: [0] },
    ] });
    expect(expandBraintrust([{ id: 'a', trialCount: null }, { id: 'b', trialCount: 0 }]))
      .toEqual([{ id: 'a', trialIndex: 0 }]);
  });

  it('H4 朴素 summary 等于行级均值，分组后重现两项题级指标', () => {
    const { mean, questionCount, passAtK, passPowerK } = results.H2;
    expect(results.H4).toEqual({ naiveSummary: mean, questionCount, passAtK, passPowerK });
    expect(results.H4.naiveSummary).not.toBe(passAtK);
    expect(results.H4.naiveSummary).not.toBe(passPowerK);
  });

  it('H5 默认 reporter 只用 error 判定，各评测必须全部成功', () => {
    expect(results.H5).toEqual({ lowScores: true, withError: false, allSuccessfulRun: true, mixedRun: false });
    expect(reportEval([{ score: 1, error: null }])).toBe(false);
    expect(reportEval([{ score: 0, error: undefined }])).toBe(true);
  });

  it('题级指标拒绝缺失、重复或非二元 trial', () => {
    const row = { example: { id: 'q1' }, trialIndex: 0, score: 1 };
    expect(() => questionMetrics([row], 2)).toThrow();
    expect(() => questionMetrics([row, row], 2)).toThrow();
    expect(() => questionMetrics([{ ...row, score: 0.5 }], 1)).toThrow();
    expect(questionMetrics([row, { ...row, example: { id: 'q2' }, score: 0 }], 1))
      .toEqual({ questionCount: 2, passAtK: 0.5, passPowerK: 0.5 });
  });
});
