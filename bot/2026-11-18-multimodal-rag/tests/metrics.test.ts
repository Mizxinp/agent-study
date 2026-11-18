import { expect, it } from "vitest";
import { mean, mrrAtK, ndcgAtK, recallAtK } from "../lib/metrics";

it("手算 recall=1/2 MRR=1/2 nDCG=(1/log2(3))/(1+1/log2(3))", () => {
  const ids = ["x", "a", "z"],
    rel = ["a", "b"];
  expect(recallAtK(ids, rel, 3)).toBe(0.5);
  expect(mrrAtK(ids, rel, 3)).toBe(0.5);
  expect(ndcgAtK(ids, rel, 3)).toBeCloseTo(
    1 / Math.log2(3) / (1 + 1 / Math.log2(3)),
    14,
  );
  expect(mrrAtK(ids, rel, 1)).toBe(0);
  expect(recallAtK([], [], 5)).toBe(0);
  expect(ndcgAtK([], [], 5)).toBe(0);
  expect(mean([0, 1, 0.5])).toBeCloseTo(0.5);
});
