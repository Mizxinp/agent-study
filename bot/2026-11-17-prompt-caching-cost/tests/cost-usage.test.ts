import { describe, expect, it } from "vitest";
import type { LanguageModelUsage } from "ai";
import { anthropicCallCost, anthropicInputCostUsd, openaiInputCostUsd, uncachedInputCostUsd } from "../lib/cost";
import { ANTHROPIC_PRICES, OPENAI_PRICES, usdFromTokens } from "../lib/prices";
import { normalizeUsage } from "../lib/usage";
import { judgeH1, judgeH2, judgeH3 } from "../lib/judge";
import { buildStablePrefix, estimateTokens } from "../lib/prefix";

function sdkUsage(partial: Partial<LanguageModelUsage> & { raw?: LanguageModelUsage["raw"] }): LanguageModelUsage {
  return {
    inputTokens: partial.inputTokens,
    inputTokenDetails: {
      noCacheTokens: partial.inputTokenDetails?.noCacheTokens,
      cacheReadTokens: partial.inputTokenDetails?.cacheReadTokens,
      cacheWriteTokens: partial.inputTokenDetails?.cacheWriteTokens,
    },
    outputTokens: partial.outputTokens,
    outputTokenDetails: {
      textTokens: partial.outputTokenDetails?.textTokens,
      reasoningTokens: partial.outputTokenDetails?.reasoningTokens,
    },
    totalTokens: partial.totalTokens,
    raw: partial.raw,
  };
}

describe("usage parsing and cost arithmetic", () => {
  it("parses Anthropic usage the way ai@7.0.173 maps official fields", () => {
    const usage = normalizeUsage(
      sdkUsage({
        inputTokens: 100_050,
        inputTokenDetails: {
          noCacheTokens: 50,
          cacheReadTokens: 100_000,
          cacheWriteTokens: 0,
        },
        outputTokens: 8,
        raw: {
          input_tokens: 50,
          cache_read_input_tokens: 100_000,
          cache_creation_input_tokens: 0,
          output_tokens: 8,
        },
      }),
    );
    expect(usage).toMatchObject({
      inputTokens: 100_050,
      noCacheTokens: 50,
      cacheReadTokens: 100_000,
      cacheWriteTokens: 0,
      outputTokens: 8,
    });
  });

  it("splits Anthropic 5m/1h cache writes from cache_creation", () => {
    const usage = normalizeUsage(
      sdkUsage({
        inputTokens: 2296,
        inputTokenDetails: {
          noCacheTokens: 2048,
          cacheReadTokens: 0,
          cacheWriteTokens: 248,
        },
        outputTokens: 503,
        raw: {
          input_tokens: 2048,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 248,
          output_tokens: 503,
          cache_creation: {
            ephemeral_5m_input_tokens: 148,
            ephemeral_1h_input_tokens: 100,
          },
        },
      }),
    );
    expect(usage.cacheCreation5m).toBe(148);
    expect(usage.cacheCreation1h).toBe(100);
    const sonnet = ANTHROPIC_PRICES["claude-sonnet-5-5"];
    const inputCost = anthropicInputCostUsd(usage, sonnet);
    const expected =
      usdFromTokens(2048, sonnet.input) +
      usdFromTokens(148, sonnet.cacheWrite5m) +
      usdFromTokens(100, sonnet.cacheWrite1h);
    expect(inputCost).toBeCloseTo(expected, 12);
  });

  it("parses OpenAI Responses usage including write-lifetime details", () => {
    const usage = normalizeUsage(
      sdkUsage({
        inputTokens: 12_000,
        inputTokenDetails: {
          noCacheTokens: 1_000,
          cacheReadTokens: 4_000,
          cacheWriteTokens: 7_000,
        },
        outputTokens: 16,
        raw: {
          input_tokens: 12_000,
          output_tokens: 16,
          input_tokens_details: {
            cached_tokens: 4_000,
            cache_write_tokens: 7_000,
            cache_write_tokens_details: {
              ttl_30m_tokens: 3_000,
              ttl_12h_tokens: 4_000,
            },
          },
        },
      }),
    );
    expect(usage).toMatchObject({
      inputTokens: 12_000,
      noCacheTokens: 1_000,
      cacheReadTokens: 4_000,
      cacheWriteTokens: 7_000,
      cacheWrite30m: 3_000,
      cacheWrite12h: 4_000,
    });
    const sol = OPENAI_PRICES["gpt-5.6-sol"];
    // Official example math at $1 / $0.10, recomputed with gpt-5.6-sol prices.
    const inputCost = openaiInputCostUsd(usage, sol);
    const expected =
      usdFromTokens(1000, sol.input) +
      usdFromTokens(4000, sol.cachedInput) +
      usdFromTokens(3000, sol.cacheWrite30m) +
      usdFromTokens(4000, sol.cacheWrite12h);
    expect(inputCost).toBeCloseTo(expected, 12);
  });

  it("computes a calculated uncached-input control for H3", () => {
    const first = normalizeUsage(
      sdkUsage({
        inputTokens: 2100,
        inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 2000 },
        outputTokens: 4,
        raw: { input_tokens: 100, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 4 },
      }),
    );
    const second = normalizeUsage(
      sdkUsage({
        inputTokens: 2100,
        inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 2000, cacheWriteTokens: 0 },
        outputTokens: 4,
        raw: { input_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 2000, output_tokens: 4 },
      }),
    );
    const prices = ANTHROPIC_PRICES["claude-sonnet-5-5"];
    const cached = anthropicInputCostUsd(first, prices) + anthropicInputCostUsd(second, prices);
    const control = uncachedInputCostUsd(first, prices.input) + uncachedInputCostUsd(second, prices.input);
    expect(cached).toBeLessThan(control);
    expect(judgeH3(cached, control, "calculated").verdict).toBe("支持");
    const callCost = anthropicCallCost(first, prices);
    expect(callCost.totalCostUsd).toBeCloseTo(callCost.inputCostUsd + callCost.outputCostUsd, 12);
  });
});

describe("hypothesis judges on fixture usage (not live API results)", () => {
  it("supports H1 when the second call reads a write-sized prefix", () => {
    const verdict = judgeH1(
      { inputTokens: 2100, outputTokens: 4, noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 2000 },
      { inputTokens: 2100, outputTokens: 4, noCacheTokens: 100, cacheReadTokens: 2000, cacheWriteTokens: 0 },
    );
    expect(verdict.verdict).toBe("支持");
  });

  it("supports H2 when both calls are writes / near-zero reads", () => {
    const verdict = judgeH2(
      { inputTokens: 2100, outputTokens: 4, noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 2000 },
      { inputTokens: 2100, outputTokens: 4, noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 2000 },
    );
    expect(verdict.verdict).toBe("支持");
  });

  it("does not treat an H1-style hit as an H2 success", () => {
    const verdict = judgeH2(
      { inputTokens: 2100, outputTokens: 4, noCacheTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 2000 },
      { inputTokens: 2100, outputTokens: 4, noCacheTokens: 100, cacheReadTokens: 2000, cacheWriteTokens: 0 },
    );
    expect(verdict.verdict).toBe("不支持");
  });
});

describe("stable prefix sizing", () => {
  it("builds a deterministic prefix at least as long as the target token estimate", () => {
    const prefix = buildStablePrefix(2048);
    expect(estimateTokens(prefix)).toBeGreaterThanOrEqual(2048);
    expect(prefix).toContain("ACME-MAN-2026-11-17-STABLE");
    expect(buildStablePrefix(2048)).toBe(prefix);
  });
});
