import { createHash } from 'node:crypto';

export const failure = { NONE: 0, ASSERT: 1, ERROR: 2 } as const;

type JsonObject = Record<string, unknown>;
interface Row extends JsonObject {
  run_id: string;
  data_source_idx: number;
  item: JsonObject;
  grades: Record<string, number>;
  passes?: Record<string, boolean>;
  grader_samples?: JsonObject;
  sample?: JsonObject;
}

function record(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRow(value: unknown): value is Row {
  if (!record(value)) return false;
  const { run_id, data_source_idx, item, grades, passes, grader_samples, sample } = value;
  return typeof run_id === 'string'
    && typeof data_source_idx === 'number' && Number.isInteger(data_source_idx) && data_source_idx >= 0
    && record(item)
    && record(grades) && Object.values(grades).every((grade) => Number.isFinite(grade))
    && (passes === undefined || (record(passes) && Object.values(passes).every((pass) => typeof pass === 'boolean')))
    && (grader_samples === undefined || record(grader_samples))
    && (sample === undefined || record(sample));
}

export function parseDashboard(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) throw new Error('Empty dashboard JSONL');
  return lines.map((line, i) => {
    const value: unknown = JSON.parse(line);
    if (!isRow(value)) throw new Error(`Invalid dashboard JSONL row ${i + 1}`);
    return value;
  });
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (!record(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function testCase(row: Row) {
  return {
    description: `Imported OpenAI eval item ${row.data_source_idx}`,
    vars: { item: row.item },
    metadata: { openaiRunId: row.run_id, openaiDataSourceIdx: row.data_source_idx },
  };
}

function grade(row: Row) {
  const componentResults = Object.entries(row.passes ?? {}).map(([name, pass]) => {
    const rawGrade = Object.hasOwn(row.grades, name) ? row.grades[name] : undefined;
    const outcome = pass ? 'passed' : 'failed';
    return {
      pass,
      score: Number(pass),
      reason: `OpenAI grader "${name}" ${outcome}${rawGrade === undefined ? '' : ` with grade ${rawGrade}`}.`,
      ...(rawGrade === undefined ? {} : { namedScores: { [name]: rawGrade } }),
    };
  });
  const failed = Object.keys(row.passes ?? {}).filter((name) => !row.passes?.[name]);
  const pass = failed.length === 0;
  let reason = 'All imported OpenAI eval graders passed.';
  if (componentResults.length === 0) {
    reason = 'Imported OpenAI eval item did not include grader pass results; grader scores are preserved as named scores.';
  } else if (!pass) {
    reason = `Imported OpenAI eval graders failed: ${failed.join(', ')}.`;
  }
  return {
    pass,
    score: componentResults.length ? (componentResults.length - failed.length) / componentResults.length : 1,
    reason,
    namedScores: row.grades,
    componentResults,
  };
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error === 'string') return error;
  if (record(error) && typeof error.message === 'string') return error.message;
  return JSON.stringify(error);
}

export function recompute(text: string) {
  const rows = parseDashboard(text);
  const runIds = [...new Set(rows.map((row) => row.run_id))];
  const testIndices = new Map<string, number>();
  const tests: ReturnType<typeof testCase>[] = [];
  const results = rows.map((row) => {
    const key = `${row.data_source_idx}:${sha256(JSON.stringify(canonical(row.item)))}`;
    let testIdx = testIndices.get(key);
    if (testIdx === undefined) {
      testIdx = tests.length;
      testIndices.set(key, testIdx);
      tests.push(testCase(row));
    }
    const error = errorMessage(row.sample?.error);
    const gradingResult = grade(row);
    return {
      promptIdx: runIds.indexOf(row.run_id),
      testIdx,
      success: error === undefined && gradingResult.pass,
      score: error === undefined ? gradingResult.score : 0,
      failureReason: error !== undefined ? failure.ERROR : gradingResult.pass ? failure.NONE : failure.ASSERT,
      ...(error === undefined ? {} : { error }),
      gradingResult,
      namedScores: row.grades,
      metadata: { openai: { outputItem: row } },
    };
  });
  const prompts = runIds.map((id, index) => {
    const column = results.filter((result) => result.promptIdx === index);
    const components = column.flatMap((result) => result.gradingResult.componentResults);
    const allHaveInput = column.every(({ metadata }) => typeof metadata.openai.outputItem.item.input === 'string');
    return {
      raw: allHaveInput ? '{{item.input}}' : 'Imported OpenAI eval item',
      label: `${allHaveInput ? 'OpenAI eval item input' : 'Imported OpenAI eval item'} (${id})`,
      provider: `openai-evals:${id}`,
      metrics: {
        testPassCount: column.filter((result) => result.success).length,
        testFailCount: column.filter((result) => result.failureReason === failure.ASSERT).length,
        testErrorCount: column.filter((result) => result.failureReason === failure.ERROR).length,
        assertPassCount: components.filter((component) => component.pass).length,
        assertFailCount: components.filter((component) => !component.pass).length,
      },
    };
  });
  const evalId = runIds.length === 1
    ? `openai-evals-${runIds[0].replace(/[^A-Za-z0-9_-]/g, '_')}`
    : `openai-evals-runs-${sha256([...runIds].sort().join('\n')).slice(0, 24)}`;
  return {
    evalId,
    config: {
      description: `Imported from OpenAI Evals run${runIds.length === 1 ? '' : 's'} ${runIds.join(', ')}`,
      tests,
      metadata: {
        openaiEvalsImport: { format: 'dashboard-output-items-jsonl', rowCount: rows.length, runIds },
      },
    },
    results: { prompts, results },
  };
}
