import { expect, it } from "vitest";
import { averageFuse, l2normalize, sorted } from "../lib/fusion";

it("平均融合在同一空间内对已归一化向量再归一化", () => {
  const a = l2normalize([3, 0, 4]);
  const b = l2normalize([0, 5, 0]);
  const f = averageFuse(a, b);
  const expected = l2normalize(a.map((x, i) => x + b[i]));
  expect(f).toEqual(expected);
  expect(Math.hypot(...f)).toBeCloseTo(1, 12);
});

it("维度不一致时抛错", () => {
  expect(() => averageFuse([1, 0], [1, 0, 0])).toThrow(/same-length/);
});

it("排序按分数降序，同分按 id 升序", () => {
  expect(sorted([{ id: "b", score: 1 }, { id: "a", score: 1 }, { id: "c", score: 2 }])).toEqual([
    { id: "c", score: 2 },
    { id: "a", score: 1 },
    { id: "b", score: 1 },
  ]);
});
