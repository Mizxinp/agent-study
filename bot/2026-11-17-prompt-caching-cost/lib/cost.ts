import { usdFromTokens } from "./prices";
import type {
  AnthropicPriceRow,
  AnthropicTtl,
  NormalizedUsage,
  OpenAIPriceRow,
  OpenAITtl,
} from "./types";

export type CostBreakdown = {
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  ordinaryTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export function anthropicInputCostUsd(
  usage: NormalizedUsage,
  prices: AnthropicPriceRow,
  ttl: AnthropicTtl = "5m",
): number {
  const write5m =
    usage.cacheCreation5m ?? (ttl === "5m" ? usage.cacheWriteTokens : 0);
  const write1h =
    usage.cacheCreation1h ?? (ttl === "1h" ? usage.cacheWriteTokens : 0);
  return (
    usdFromTokens(usage.noCacheTokens, prices.input) +
    usdFromTokens(usage.cacheReadTokens, prices.cacheRead) +
    usdFromTokens(write5m, prices.cacheWrite5m) +
    usdFromTokens(write1h, prices.cacheWrite1h)
  );
}

export function openaiInputCostUsd(
  usage: NormalizedUsage,
  prices: OpenAIPriceRow,
  ttl: OpenAITtl = "30m",
): number {
  const write30m =
    usage.cacheWrite30m ?? (ttl === "30m" ? usage.cacheWriteTokens : 0);
  const write12h =
    usage.cacheWrite12h ?? (ttl === "12h" ? usage.cacheWriteTokens : 0);
  const ordinary = Math.max(
    0,
    usage.noCacheTokens ||
      usage.inputTokens - usage.cacheReadTokens - usage.cacheWriteTokens,
  );
  return (
    usdFromTokens(ordinary, prices.input) +
    usdFromTokens(usage.cacheReadTokens, prices.cachedInput) +
    usdFromTokens(write30m, prices.cacheWrite30m) +
    usdFromTokens(write12h, prices.cacheWrite12h)
  );
}

export function uncachedInputCostUsd(
  usage: NormalizedUsage,
  inputUsdPerMillion: number,
): number {
  return usdFromTokens(usage.inputTokens, inputUsdPerMillion);
}

export function anthropicCallCost(
  usage: NormalizedUsage,
  prices: AnthropicPriceRow,
  ttl: AnthropicTtl = "5m",
): CostBreakdown {
  const inputCostUsd = anthropicInputCostUsd(usage, prices, ttl);
  const outputCostUsd = usdFromTokens(usage.outputTokens, prices.output);
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    ordinaryTokens: usage.noCacheTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}

export function openaiCallCost(
  usage: NormalizedUsage,
  prices: OpenAIPriceRow,
  ttl: OpenAITtl = "30m",
): CostBreakdown {
  const inputCostUsd = openaiInputCostUsd(usage, prices, ttl);
  const outputCostUsd = usdFromTokens(usage.outputTokens, prices.output);
  return {
    inputCostUsd,
    outputCostUsd,
    totalCostUsd: inputCostUsd + outputCostUsd,
    ordinaryTokens: usage.noCacheTokens,
    cacheReadTokens: usage.cacheReadTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
  };
}
