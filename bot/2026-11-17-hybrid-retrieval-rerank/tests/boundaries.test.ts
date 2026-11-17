import { it, expect } from "vitest";
import { recallAtK, mrrAtK, ndcgAtK } from "../lib/metrics";
import { rrf, relativeScoreFusion } from "../lib/fusion";
import { buildChunks } from "../lib/chunk";
import { vectorSearch } from "../lib/vector";
import { buildIndex, search } from "../lib/bm25";
import { createRerankAdapter } from "../lib/rerank-adapter";
import { rerank } from "ai";
import { rerankHits } from "../lib/pipeline";
import chunks from "../data/chunks.json";
it("MRR@10包括第6和第10，排除第11", () => {
  for (const rank of [6, 10, 11]) {
    const ids = Array.from({ length: 11 }, (_, i) =>
      i === rank - 1 ? "hit" : `x${i}`,
    );
    expect(mrrAtK(ids, ["hit"], 10)).toBe(rank <= 10 ? 1 / rank : 0);
    expect(recallAtK(ids, ["hit"], 5)).toBe(0);
    expect(ndcgAtK(ids, ["hit"], 5)).toBe(0);
  }
});
it("空结果和k=0指标为0", () => {
  for (const ids of [[], ["a"]]) {
    expect(recallAtK(ids, ["a"], 0)).toBe(0);
    expect(mrrAtK(ids, ["a"], 0)).toBe(0);
    expect(ndcgAtK(ids, ["a"], 0)).toBe(0);
  }
});
it("recall对重复相关标签和命中去重", () =>
  expect(recallAtK(["a", "a"], ["a", "a", "b"], 5)).toBe(0.5));
it("RRF空路和单路及零分文档仍有rank贡献", () => {
  expect(rrf([[], [{ id: "a", score: 0 }]])).toEqual([
    { id: "a", score: 1 / 61 },
  ]);
});
it("RSF两个空路", () => expect(relativeScoreFusion([], [], 0.5)).toEqual([]));
it("RSF alpha端点", () => {
  const a = [
      { id: "a", score: 0 },
      { id: "b", score: 2 },
    ],
    b = [
      { id: "a", score: 2 },
      { id: "b", score: 0 },
    ];
  expect(relativeScoreFusion(a, b, 0)[0].id).toBe("b");
  expect(relativeScoreFusion(a, b, 1)[0].id).toBe("a");
});
it("BM25无匹配仍以零分补足30", () => {
  const docs = Array.from({ length: 40 }, (_, i) => ({
    id: String(i),
    text: "x",
  }));
  expect(
    search(
      buildIndex(docs, (s) => s.split(" ")),
      "absent",
      30,
    ),
  ).toHaveLength(30);
  expect(
    search(
      buildIndex(docs, (s) => s.split(" ")),
      "absent",
      30,
    ).every((x) => x.score === 0),
  ).toBe(true);
});
const doc = (text: string) => [
  { id: "d", title: "商品", model: "M", sections: [{ title: "说明", text }] },
];
it("分块长句Unicode覆盖且不超过160码点", () => {
  const text = "瓷😀".repeat(200);
  const cs = buildChunks(doc(text));
  expect(cs.map((c) => c.text).join("")).toBe(text);
  expect(cs.every((c) => Array.from(c.text).length <= 160)).toBe(true);
});
it("分块句子覆盖与最后一句重叠", () => {
  const sentences = Array.from(
    { length: 8 },
    (_, i) => `${i}${"瓷".repeat(38)}。`,
  );
  const cs = buildChunks(doc(sentences.join("")));
  for (const s of sentences)
    expect(cs.some((c) => c.text.includes(s))).toBe(true);
  expect(cs[1].text.startsWith(sentences[3])).toBe(true);
  expect(cs[0].contextualText).toContain("商品（M）｜说明");
});
it("空分节不生成块", () => expect(buildChunks(doc(""))).toEqual([]));
it("二维cosine手算1、0、-1、0.6并截断", () => {
  const r = vectorSearch(
    [
      { id: "same", embedding: [1, 0] },
      { id: "orth", embedding: [0, 1] },
      { id: "opposite", embedding: [-1, 0] },
      { id: "three-four", embedding: [3, 4] },
    ],
    [1, 0],
    4,
  );
  expect(r.map((x) => x.score)).toEqual([1, 0.6, 0, -1]);
  expect(vectorSearch([{ id: "a", embedding: [1, 0] }], [1, 0], 0)).toEqual([]);
});
it("adapter拒绝空分数", async () => {
  await expect(
    rerank({
      model: createRerankAdapter(async () => []),
      query: "q",
      documents: ["a"],
      maxRetries: 0,
    }),
  ).rejects.toThrow("Invalid scores");
});
it("adapter拒绝分数个数不匹配", async () => {
  await expect(
    rerank({
      model: createRerankAdapter(async () => [1, 2]),
      query: "q",
      documents: ["a"],
      maxRetries: 0,
    }),
  ).rejects.toThrow("Invalid scores");
});
it("adapter拒绝非有限分数", async () => {
  await expect(
    rerank({
      model: createRerankAdapter(async () => [NaN]),
      query: "q",
      documents: ["a"],
      maxRetries: 0,
    }),
  ).rejects.toThrow("Invalid scores");
});
it("rerankHits默认5，评测30，始终只打分前30", async () => {
  const hits = chunks.slice(0, 35).map((c) => ({ id: c.id, score: 0 }));
  let count = 0;
  const model = createRerankAdapter(async (_, docs) => {
    count = docs.length;
    return docs.map((_, i) => i);
  });
  expect(await rerankHits("q", hits, model)).toHaveLength(5);
  const full = await rerankHits("q", hits, model, false, 30);
  expect(full).toHaveLength(30);
  expect(count).toBe(30);
  expect(full[0].id).toBe(hits[29].id);
});
