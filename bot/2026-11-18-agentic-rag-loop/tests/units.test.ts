import { describe, expect, it } from "vitest";
import { EMPTY_ASK_ERROR, parseAskBody, validateAskInput } from "../lib/ask-input";
import { corpus, products, questions } from "../lib/data";
import { filterProducts } from "../lib/filter";
import { exactMatch, percentile, setF1, signTestP } from "../lib/metrics";
import { resolveLlmConfig } from "../lib/providers";
import { fuseTopK } from "../lib/retrieval";

describe("POST /api/ask 输入校验", () => {
  it("空请求 / 空问题 / 非法 JSON 返回 400 与明确错误", () => {
    for (const body of ["", "  ", "{}", "not json", "[]", '{"question":"   "}']) {
      expect(validateAskInput(parseAskBody(body))).toEqual({ ok: false, status: 400, error: EMPTY_ASK_ERROR });
    }
    expect(validateAskInput({ question: "x", pipeline: "graph" })).toMatchObject({ ok: false, status: 400 });
    expect(validateAskInput({ question: "x" })).toEqual({ ok: true, value: { question: "x", pipeline: "agentic" } });
  });
});

describe("数据与冻结问题集", () => {
  it("属性表为合成数据，问题集数量达标，标准答案都是已知 SKU 或空集", () => {
    expect(products).toHaveLength(16);
    const skus = new Set(products.map((p) => p.sku));
    const count = (t: string) => questions.filter((q) => q.type === t).length;
    expect(count("single")).toBeGreaterThanOrEqual(12);
    expect(count("multi")).toBeGreaterThanOrEqual(12);
    expect(count("null")).toBeGreaterThanOrEqual(12);
    for (const q of questions) {
      for (const g of q.gold) expect(skus.has(g)).toBe(true);
      expect(q.type === "null" ? q.gold.length === 0 : q.gold.length > 0).toBe(true);
    }
    expect(corpus.filter((c) => c.section === "属性表")).toHaveLength(16);
    expect(corpus).toHaveLength(112 + 16);
  });

  it("多跳题标准答案可由属性表复算（例：m01 / m02 / m09）", () => {
    const base = products.find((p) => p.sku === "DH-TC-0915")!;
    const m01 = filterProducts(products, { glaze: base.glaze, minCapacityMl: base.capacityMl + 1 }).map((p) => p.sku);
    expect(m01.sort()).toEqual(questions.find((q) => q.id === "m01")!.gold.slice().sort());
    const m02 = filterProducts(products, { glaze: "建白", minPriceCny: 69 }).map((p) => p.sku);
    expect(m02.sort()).toEqual(questions.find((q) => q.id === "m02")!.gold.slice().sort());
    const m09 = filterProducts(products, { glaze: "建白釉", listedAfter: "2026-06-01" }).map((p) => p.sku);
    expect(m09.sort()).toEqual(questions.find((q) => q.id === "m09")!.gold.slice().sort());
    expect(filterProducts(products, { minPriceCny: 1000 })).toEqual([]);
  });
});

describe("指标与融合纯函数", () => {
  it("集合精确匹配、F1、空集与未作答", () => {
    expect(exactMatch(["dh-tc-0915 "], ["DH-TC-0915"])).toBe(true);
    expect(exactMatch([], [])).toBe(true);
    expect(exactMatch(null, [])).toBe(false);
    expect(exactMatch(["A"], ["A", "B"])).toBe(false);
    expect(setF1(["A"], ["A", "B"])).toBeCloseTo(2 / 3);
    expect(setF1([], ["A"])).toBe(0);
    expect(setF1([], [])).toBe(1);
  });
  it("分位数与符号检验", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 0.95)).toBeCloseTo(48);
    expect(signTestP(0, 0)).toBe(1);
    expect(signTestP(6, 0)).toBeCloseTo(0.03125);
  });
  it("RRF 融合按两路名次累加", () => {
    const top = fuseTopK([{ id: "a", score: 9 }, { id: "b", score: 1 }], [{ id: "b", score: 0.9 }, { id: "c", score: 0.1 }], 2);
    expect(top.map((h) => h.id)).toEqual(["b", "a"]);
  });
});

describe("LLM 配置（不发请求、不读真实密钥）", () => {
  it("无密钥时报告缺失；base 必须显式且以 /v1 结尾", () => {
    expect(resolveLlmConfig({})).toEqual({ ok: false, reason: "缺少 ANTHROPIC_API_KEY" });
    expect(resolveLlmConfig({ ANTHROPIC_API_KEY: "test" })).toMatchObject({ ok: false });
    expect(resolveLlmConfig({ ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: "https://example.test" })).toMatchObject({ ok: false });
    expect(resolveLlmConfig({ ANTHROPIC_API_KEY: "test", ANTHROPIC_BASE_URL: "https://example.test/v1/" })).toEqual({
      ok: true, provider: "anthropic", modelId: "claude-haiku-5-5", baseURL: "https://example.test/v1",
    });
  });
});

describe("净延迟（扣除 429/失败重试）", () => {
  it("失败请求从其开始到下一请求开始的时间被扣除", async () => {
    const { netLatency } = await import("../lib/request-timing");
    const recs = [
      { start: 0, end: 100, status: 429 },
      { start: 2100, end: 2600, status: 200 },
      { start: 2700, end: 3000, status: 200 },
    ];
    expect(netLatency(3100, recs)).toEqual({ netMs: 1000, failedRequests: 1, retryOverheadMs: 2100 });
    expect(netLatency(500, [{ start: 0, end: 400, status: 200 }])).toEqual({ netMs: 500, failedRequests: 0, retryOverheadMs: 0 });
  });
});
