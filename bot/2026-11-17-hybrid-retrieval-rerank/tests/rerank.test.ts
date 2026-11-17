import { describe, it, expect } from "vitest";
import { rerank } from "ai";
import type { RerankingModelV4 } from "@ai-sdk/provider";
import { createRerankAdapter } from "../lib/rerank-adapter";
const model: RerankingModelV4 = {
  specificationVersion: "v4",
  provider: "local",
  modelId: "unsorted",
  async doRerank() {
    return {
      ranking: [
        { index: 0, relevanceScore: 0.1 },
        { index: 1, relevanceScore: 0.9 },
      ],
    };
  },
};
describe("H6 实测 SDK v7", () => {
  it("适配器排序且 topN 正确映射文档", async () => {
    const m = createRerankAdapter(async () => [0.1, 0.9]);
    const r = await rerank({ model: m, query: "q", documents: ["a", "b"] });
    expect(r.ranking.map((x) => x.score)).toEqual([0.9, 0.1]);
    expect(r.rerankedDocuments).toEqual(["b", "a"]);
    expect(
      (await rerank({ model: m, query: "q", documents: ["a", "b"], topN: 1 }))
        .rerankedDocuments,
    ).toEqual(["b"]);
  });
  it("核心不重排：未排序 ranking 原样保留", async () => {
    const r = await rerank({ model, query: "q", documents: ["a", "b"] });
    expect(r.ranking.map((x) => x.score)).toEqual([0.1, 0.9]);
    expect(r.rerankedDocuments).toEqual(["a", "b"]);
  });
  it("越界索引抛 AI_InvalidResponseDataError", async () => {
    await expect(
      rerank({
        model: {
          ...model,
          doRerank: async () => ({
            ranking: [{ index: 99, relevanceScore: 1 }],
          }),
        },
        query: "q",
        documents: ["a"],
        maxRetries: 0,
      }),
    ).rejects.toMatchObject({ name: "AI_InvalidResponseDataError" });
  });
  it("空 documents 直接返回，doRerank 调用次数为 0", async () => {
    let n = 0;
    const r = await rerank({
      model: {
        ...model,
        doRerank: async () => {
          n++;
          return { ranking: [] };
        },
      },
      query: "q",
      documents: [],
    });
    expect(n).toBe(0);
    expect(r.ranking).toEqual([]);
  });
});
