import { runModelCall } from "./call";
import { anthropicInputCostUsd, openaiInputCostUsd, uncachedInputCostUsd } from "./cost";
import { judgeH1, judgeH2, judgeH3, judgeH4 } from "./judge";
import {
  ANTHROPIC_PRICE_SOURCE,
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TARGET_PREFIX_TOKENS,
  OPENAI_PRICE_SOURCE,
} from "./prices";
import { H1_QUESTION_A, H1_QUESTION_B, buildStablePrefix, estimateTokens } from "./prefix";
import { buildH1Messages, buildH2Messages, openaiRequestOptions } from "./prompts";
import type { RunnableProvider } from "./providers";
import type { AnthropicPriceRow, OpenAIPriceRow, ProviderRunResult } from "./types";
import { looksUncached } from "./usage";

const PREFIX_STEPS = [2048, 4096, 8192];

function requestOptions(
  provider: RunnableProvider,
  _kind: "h1-prefix" | "h2-on-question" | "no-cache",
  prewarm = false,
) {
  // Anthropic breakpoints live on messages (block-level cache_control).
  // Do not set request-level cacheControl: that would enable automatic caching.
  if (provider.priceKind === "openai") {
    return { openai: openaiRequestOptions(_kind, prewarm) };
  }
  return undefined;
}

function inputCost(provider: RunnableProvider, usage: ProviderRunResult["calls"][number]["usage"]): number {
  return provider.priceKind === "anthropic"
    ? anthropicInputCostUsd(usage, provider.prices as AnthropicPriceRow)
    : openaiInputCostUsd(usage, provider.prices as OpenAIPriceRow);
}

function inputUnitPrice(provider: RunnableProvider): number {
  return provider.prices.input;
}

export type ExperimentConfig = {
  targetPrefixTokens?: number;
  maxOutputTokens?: number;
  prewarm?: boolean;
};

export async function runProviderExperiment(
  provider: RunnableProvider,
  config: ExperimentConfig = {},
): Promise<ProviderRunResult> {
  const maxOutputTokens = config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
  const requested = config.targetPrefixTokens ?? DEFAULT_TARGET_PREFIX_TOKENS;
  const startTokens = Math.max(requested, provider.minCacheableTokens);
  const sizes = [startTokens, ...PREFIX_STEPS.filter((size) => size > startTokens)];

  let estimatedPrefixTokens = startTokens;
  let prefix = buildStablePrefix(startTokens);
  let enlargedPrefix = false;
  let h1First = null as Awaited<ReturnType<typeof runModelCall>> | null;
  const calls: ProviderRunResult["calls"] = [];

  if (config.prewarm) {
    const prewarm = await runModelCall({
      model: provider.model,
      modelId: provider.modelId,
      provider: provider.provider,
      label: "prewarm",
      scenario: "prewarm",
      messages: buildH1Messages(prefix, H1_QUESTION_A),
      question: H1_QUESTION_A,
      maxOutputTokens: provider.priceKind === "anthropic" ? 0 : maxOutputTokens,
      estimatedPrefixTokens: estimateTokens(prefix),
      providerOptions: requestOptions(provider, "h1-prefix", true),
      prices: provider.prices,
    });
    calls.push(prewarm);
  }

  for (const [index, size] of sizes.entries()) {
    if (index > 0) {
      prefix = buildStablePrefix(size);
      enlargedPrefix = true;
    }
    estimatedPrefixTokens = estimateTokens(prefix);
    h1First = await runModelCall({
      model: provider.model,
      modelId: provider.modelId,
      provider: provider.provider,
      label: "H1 request 1 (write expected)",
      scenario: "h1",
      messages: buildH1Messages(prefix, H1_QUESTION_A),
      question: H1_QUESTION_A,
      maxOutputTokens,
      estimatedPrefixTokens,
      providerOptions: requestOptions(provider, "h1-prefix"),
      prices: provider.prices,
    });
    const tooShort = looksUncached(h1First.usage) && h1First.usage.inputTokens < provider.minCacheableTokens * 1.05;
    if (!tooShort || index === sizes.length - 1) break;
  }

  if (!h1First) throw new Error("H1 first request was not recorded.");
  calls.push(h1First);

  const h1Second = await runModelCall({
    model: provider.model,
    modelId: provider.modelId,
    provider: provider.provider,
    label: "H1 request 2 (read expected, question changed)",
    scenario: "h1",
    messages: buildH1Messages(prefix, H1_QUESTION_B),
    question: H1_QUESTION_B,
    maxOutputTokens,
    estimatedPrefixTokens,
    providerOptions: requestOptions(provider, "h1-prefix"),
    prices: provider.prices,
  });
  calls.push(h1Second);

  const stampA = new Date().toISOString();
  const h2First = await runModelCall({
    model: provider.model,
    modelId: provider.modelId,
    provider: provider.provider,
    label: "H2 request 1 (breakpoint on changing question)",
    scenario: "h2",
    messages: buildH2Messages(prefix, H1_QUESTION_A, stampA),
    question: `${H1_QUESTION_A} (request marker: ${stampA})`,
    maxOutputTokens,
    estimatedPrefixTokens,
    providerOptions: requestOptions(provider, "h2-on-question"),
    prices: provider.prices,
  });
  calls.push(h2First);

  const stampB = new Date().toISOString();
  const h2Second = await runModelCall({
    model: provider.model,
    modelId: provider.modelId,
    provider: provider.provider,
    label: "H2 request 2 (breakpoint on changing question)",
    scenario: "h2",
    messages: buildH2Messages(prefix, H1_QUESTION_B, stampB),
    question: `${H1_QUESTION_B} (request marker: ${stampB})`,
    maxOutputTokens,
    estimatedPrefixTokens,
    providerOptions: requestOptions(provider, "h2-on-question"),
    prices: provider.prices,
  });
  calls.push(h2Second);

  const h1InputCostUsd = inputCost(provider, h1First.usage) + inputCost(provider, h1Second.usage);
  const uncachedControlInputCostUsd =
    uncachedInputCostUsd(h1First.usage, inputUnitPrice(provider)) +
    uncachedInputCostUsd(h1Second.usage, inputUnitPrice(provider));

  return {
    provider: provider.provider,
    modelId: provider.modelId,
    retrievalMode:
      provider.priceKind === "openai"
        ? "OpenAI Responses explicit prompt_cache_options + prompt_cache_breakpoint"
        : "Anthropic explicit block-level cache_control (not top-level automatic caching)",
    prefixChars: prefix.length,
    estimatedPrefixTokens,
    minCacheableTokens: provider.minCacheableTokens,
    enlargedPrefix,
    priceSource: provider.priceKind === "openai" ? OPENAI_PRICE_SOURCE : ANTHROPIC_PRICE_SOURCE,
    priceRow: provider.prices,
    calls,
    hypotheses: [
      judgeH1(h1First.usage, h1Second.usage),
      judgeH2(h2First.usage, h2Second.usage),
      judgeH3(h1InputCostUsd, uncachedControlInputCostUsd, "calculated"),
      judgeH4(h1First, h1Second),
    ],
    h3ControlKind: "calculated",
    h1InputCostUsd,
    uncachedControlInputCostUsd,
    inputSavingsUsd: uncachedControlInputCostUsd - h1InputCostUsd,
  };
}
