import { it, expect } from "vitest";
import { bigramTokenize, segmenterTokenize } from "../lib/tokenize";
import { buildIndex, search } from "../lib/bm25";
it("中文 bigram、单字、完整型号及子 token", () => {
  expect(bigramTokenize("白瓷茶具 A DH-TC-0915 中")).toEqual([
    "白瓷",
    "瓷茶",
    "茶具",
    "a",
    "dh-tc-0915",
    "dh",
    "tc",
    "0915",
    "中",
  ]);
  expect(segmenterTokenize("DH-TC-0915")).toEqual([
    "dh-tc-0915",
    "dh",
    "tc",
    "0915",
  ]);
});
it("BM25 手算 N=2 df=1 tf=2 dl=3 avgdl=2.5", () => {
  const idx = buildIndex(
    [
      { id: "a", text: "x x y" },
      { id: "b", text: "y z" },
    ],
    (s) => s.split(" "),
  );
  const expected =
    (Math.log(1 + (2 - 1 + 0.5) / (1 + 0.5)) * 2 * 2.2) /
    (2 + 1.2 * (0.25 + (0.75 * 3) / 2.5));
  expect(Math.abs(search(idx, "x", 2)[0].score - expected)).toBeLessThan(1e-9);
});
