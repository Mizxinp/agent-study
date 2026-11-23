import { evaluate, ruleNames } from "./evaluation";
import { source, type FrozenRow } from "./frozen";

export function normalizeInput(input: string): string {
  return input.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

export function promote(
  rows: readonly FrozenRow[],
  questions: readonly { id: string; question: string }[],
) {
  const inputs = new Map(questions.map(({ id, question }) => [id, question]));
  const groups = new Map<string, { input: string; traces: ReturnType<typeof failure>[] }>();

  function failure(trace: ReturnType<typeof evaluate>["scored"][number]) {
    const { row } = trace;
    const failedRules = ruleNames.filter((rule) => !trace[rule]);
    return {
      qid: row.qid,
      pipeline: row.pipeline,
      run: row.run,
      output: { answer: row.answer, rationale: row.rationale },
      observed: {
        questionType: row.type,
        failedRules,
        exactMatchFailed: !row.correct,
        finishReason: row.finishReason,
        stepCount: row.steps.length,
        answerCallSteps: row.steps.filter((step) =>
          step.toolCalls.some((call) => call.toolName === "answer"),
        ).map((step) => step.step),
        toolErrors: row.steps.flatMap((step) =>
          step.toolResults.filter((result) => result.error === true)
            .map(({ toolName, summary }) => ({ step: step.step, toolName, summary })),
        ),
      },
      assertions: [
        { kind: "exactSkuSet", expected: row.gold },
        ...failedRules.map((kind) => ({ kind, expected: true })),
      ],
    };
  }

  const ordered = evaluate(rows).scored.toSorted((a, b) =>
    compare(a.row.qid, b.row.qid) ||
    compare(a.row.pipeline, b.row.pipeline) ||
    a.row.run - b.row.run,
  );

  for (const trace of ordered) {
    if (trace.row.correct && ruleNames.every((rule) => trace[rule])) continue;
    const input = inputs.get(trace.row.qid);
    if (!input || !normalizeInput(input)) throw new Error(`Missing prompt: ${trace.row.qid}`);
    const key = normalizeInput(input);
    const group = groups.get(key) ?? { input, traces: [] };
    group.traces.push(failure(trace));
    groups.set(key, group);
  }

  return {
    schemaVersion: 1,
    source,
    cases: [...groups.keys()].sort(compare).map((normalizedInput) => ({
      normalizedInput,
      ...groups.get(normalizedInput)!,
    })),
  };
}

export function serializePromotion(...args: Parameters<typeof promote>): string {
  return JSON.stringify(promote(...args), null, 2) + "\n";
}
