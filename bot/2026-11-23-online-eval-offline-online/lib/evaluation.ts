import { onlineTrace, type FrozenRow } from "./frozen";
import { hasSearchCall, hasSearchResult, rules } from "./online";

export const pipelines = ["fixed", "agentic"] as const;
export const ruleNames = Object.keys(rules) as (keyof typeof rules)[];

export function evaluate(rows: readonly FrozenRow[]) {
  const scored = rows.map((row) => {
    const trace = onlineTrace(row);
    return { row, skuSet: rules.skuSet(trace), noToolError: rules.noToolError(trace) };
  });

  const h1 = pipelines.flatMap((pipeline) => {
    const group = scored.filter(({ row }) => row.pipeline === pipeline);
    return ruleNames.map((rule) => ({
      pipeline,
      rule,
      n: group.length,
      pass: group.filter((trace) => trace[rule]).length,
      goldPass: group.filter(({ row }) => row.correct).length,
      passGoldFail: group.filter((trace) => trace[rule] && !trace.row.correct).length,
      failGoldPass: group.filter((trace) => !trace[rule] && trace.row.correct).length,
    }));
  });

  const eligible = scored.filter(({ row }) =>
    row.pipeline === "agentic" && hasSearchCall(onlineTrace(row).steps[0]),
  );
  const h2 = {
    n: eligible.length,
    localPass: eligible.filter(({ row }) => hasSearchResult(onlineTrace(row).steps[0])).length,
    goldPass: eligible.filter(({ row }) => row.correct).length,
  };
  return { scored, h1, h2 };
}
