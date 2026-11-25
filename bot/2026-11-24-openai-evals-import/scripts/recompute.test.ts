import { describe, expect, it } from 'vitest';
import { fixture } from './fixtures';
import { failure, parseDashboard, recompute } from './recompute';

describe('dashboard JSONL', () => {
  it('H1 preserves both outcomes and the original rows', () => {
    const input = fixture('openai-evals-items.jsonl');
    const { evalId, config, results } = recompute(input);
    expect(evalId).toBe('openai-evals-evalrun_import_fixture');
    expect(config.description).toContain('Imported from OpenAI Evals');
    expect(config.metadata.openaiEvalsImport.format).toBe('dashboard-output-items-jsonl');
    expect(results.prompts[0].metrics).toEqual({
      testPassCount: 1, testFailCount: 1, testErrorCount: 0, assertPassCount: 5, assertFailCount: 1,
    });
    const [passed, failed] = results.results;
    expect(passed.namedScores.Relevance).toBe(6);
    expect(passed.gradingResult.componentResults[0]).toMatchObject({ score: 1, namedScores: { Relevance: 6 } });
    expect(failed.failureReason).toBe(failure.ASSERT);
    expect(failed.gradingResult.reason).toContain('Relevance');
    expect(failed.score).toBe(2 / 3);
    expect(results.results.map((row) => row.metadata.openai.outputItem)).toEqual(parseDashboard(input));
  });

  it('H2/H5 counts score-only as passing and preserves criteria only in the original row', () => {
    const { evalId, config, results } = recompute(fixture('score-only.jsonl'));
    expect(evalId).toBe('openai-evals-score_only');
    const [row] = results.results;
    expect(row).toMatchObject({ success: true, score: 1, namedScores: { Quality: 0.5 } });
    expect(row.gradingResult).toMatchObject({ pass: true, score: 1, componentResults: [] });
    expect(row.gradingResult.reason).toContain('did not include grader pass results');
    expect(results.prompts[0].metrics).toEqual({
      testPassCount: 1, testFailCount: 0, testErrorCount: 0, assertPassCount: 0, assertFailCount: 0,
    });
    expect(config.tests[0]).not.toHaveProperty('assert');
    expect(row.metadata.openai.outputItem.testing_criteria).toHaveLength(1);
  });

  it('H3 separates errors from assertion failures and aligns runs', () => {
    const { evalId, results } = recompute(fixture('openai-evals-multi-run-items.jsonl'));
    const [errored, passed] = results.results;
    expect(evalId).toBe('openai-evals-runs-db6ef0a45a701531da4d6397');
    expect(errored).toMatchObject({
      failureReason: failure.ERROR, score: 0, success: false,
      error: 'Response input item missing role', promptIdx: 0, testIdx: 0,
    });
    expect(passed).toMatchObject({ success: true, promptIdx: 1, testIdx: 0 });
    expect(results.prompts[0].metrics.testErrorCount).toBe(1);
    expect(new Set(results.prompts.map((prompt) => prompt.provider)).size).toBe(2);
  });

  it('handles string errors even if grader passes are true', () => {
    const [row] = recompute(JSON.stringify({
      run_id: 'string_error', data_source_idx: 0, item: {}, grades: {},
      passes: { Quality: true }, sample: { error: 'sample failed' },
    })).results.results;
    expect(row.gradingResult.pass).toBe(true);
    expect(row).toMatchObject({ error: 'sample failed', success: false, failureReason: failure.ERROR, score: 0 });
  });

  it('H4 uses both index and canonical item content', () => {
    const { evalId, config, results } = recompute(fixture('alignment.jsonl'));
    expect(evalId).toBe('openai-evals-runs-3085d6843a17bc913acf2890');
    expect(config.tests).toHaveLength(3);
    expect(results.results.map((row) => [row.promptIdx, row.testIdx])).toEqual([[0, 0], [1, 0], [1, 1], [0, 2]]);
  });

  it('rejects schema mismatches and malformed JSON lines', () => {
    expect(() => parseDashboard(fixture('invalid-row.jsonl'))).toThrow('row 2');
    expect(() => parseDashboard('{')).toThrow(SyntaxError);
  });
});
