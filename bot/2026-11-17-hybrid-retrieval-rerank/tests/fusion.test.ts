import { it, expect } from "vitest";
import { rrf, relativeScoreFusion } from "../lib/fusion";
it("RRF ranks 从1起，手算 1/61+1/62，tie 按 id", () => {
  const r = rrf([
    [
      { id: "b", score: 9 },
      { id: "a", score: 2 },
    ],
    [
      { id: "a", score: 5 },
      { id: "b", score: 0 },
    ],
  ]);
  expect(r.map((x) => x.id)).toEqual(["a", "b"]);
  expect(r[0].score).toBeCloseTo(1 / 61 + 1 / 62, 14);
});
it("RSF min-max 加权，缺失0，单元素或恒定路为1", () => {
  const r = relativeScoreFusion(
    [
      { id: "a", score: 10 },
      { id: "b", score: 20 },
    ],
    [{ id: "a", score: 8 }],
    0.25,
  );
  expect(r).toEqual([
    { id: "b", score: 0.75 },
    { id: "a", score: 0.25 },
  ]);
  expect(
    relativeScoreFusion(
      [
        { id: "b", score: 2 },
        { id: "a", score: 2 },
      ],
      [],
      0,
    ),
  ).toEqual([
    { id: "a", score: 1 },
    { id: "b", score: 1 },
  ]);
  expect(rrf([])).toEqual([]);
});
