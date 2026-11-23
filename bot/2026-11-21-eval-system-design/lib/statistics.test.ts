import { describe, expect, it } from "vitest";
import { readVerifiedResults } from "./frozen";
import {
  four, inspectRationales, intervals, JUDGE_STATUS, pairedTests, pipelines,
  questionsFromRows, slices, summarize,
} from "./statistics";

const frozen = readVerifiedResults();
const questions = questionsFromRows(frozen.rows);
const group = (slice: (typeof slices)[number]) =>
  questions.filter(question => slice === "all" || question.type === slice);

describe("冻结评测", () => {
  it("核验文件、题数、行数及 2.3 的全部精确匹配点估计", () => {
    expect(frozen.rows).toHaveLength(240);
    expect(slices.map(slice => group(slice).length)).toEqual([13, 14, 13, 40]);
    for (const slice of slices) {
      for (const pipeline of pipelines) {
        const metrics = summarize(group(slice), pipeline);
        const reference = frozen.summary[slice][pipeline];
        expect(metrics.n).toBe(reference.n);
        expect(Number(four(metrics.accuracy))).toBe(reference.accuracy);
      }
    }
  });

  it.each([["multi", "fixed"], ["null", "agentic"], ["all", "fixed"]] as const)(
    "%s/%s 的 bootstrap 可复现，展开区间较窄",
    (slice, pipeline) => {
      const result = intervals(group(slice), pipeline);
      expect(intervals(group(slice), pipeline)).toEqual(result);
      expect(result.byTrial.width).toBeLessThan(result.byQuestion.width);
      for (const interval of Object.values(result)) {
        expect(Number(four(interval.estimate))).toBe(frozen.summary[slice][pipeline].accuracy);
        expect(interval.lower).toBeLessThan(interval.estimate);
        expect(interval.upper).toBeGreaterThan(interval.estimate);
      }
    },
  );

  it.each([
    ["single", "fixed", "0.9487", "1.0000", "0.9231"],
    ["null", "agentic", "0.8974", "1.0000", "0.8462"],
    ["multi", "fixed", "0.4048", "0.4286", "0.3571"],
  ] as const)("%s/%s 区分单次、至少一次和三次全对", (slice, pipeline, accuracy, any, all) => {
    const metrics = summarize(group(slice), pipeline);
    expect([metrics.accuracy, metrics.passAt3, metrics.passAll3].map(four)).toEqual([accuracy, any, all]);
  });

  it("只对正确的 agentic 行检查解释，并保留真实摘录", () => {
    const { checked, hits } = inspectRationales(frozen.rows);
    expect(checked).toBe(116);
    expect(hits).toHaveLength(86);
    expect(hits.every(hit => !hit.empty && !hit.contradiction && hit.outsideGold.length)).toBe(true);
    for (const hit of hits) {
      expect(frozen.rows).toContainEqual(expect.objectContaining({
        pipeline: "agentic", correct: true, qid: hit.qid, run: hit.run, rationale: hit.excerpt,
      }));
    }
    expect(hits[0]).toMatchObject({ qid: "m01", run: 1, outsideGold: ["DH-TC-0915"] });
  });

  it.each([
    ["single", 13, 1, 0, 12, 1],
    ["multi", 14, 9, 0, 5, 0.00390625],
    ["null", 13, 1, 2, 10, 1],
    ["all", 40, 11, 2, 27, 0.0224609375],
  ] as const)("%s 按题检验，并复核 2.3 的展开检验", (slice, n, agenticWins, fixedWins, ties, p) => {
    const { byQuestion, byTrial } = pairedTests(group(slice));
    expect(byQuestion).toEqual({ n, agenticWins, fixedWins, ties, p });
    const { signTestP, ...counts } = frozen.paired[slice];
    expect(byTrial).toMatchObject({ ...counts, n: n * 3 });
    expect(Number(four(byTrial.p))).toBe(signTestP);
    if (signTestP === 0) {
      expect(byTrial.p).toBeGreaterThan(0);
      expect(byTrial.p).toBeLessThan(0.001);
    }
  });

  it("始终跳过 LLM judge", () => {
    expect(JUDGE_STATUS).toBe("SKIPPED");
  });

  it("统计后再次核验源文件与副本", () => {
    expect(readVerifiedResults()).toEqual(frozen);
  });
});
