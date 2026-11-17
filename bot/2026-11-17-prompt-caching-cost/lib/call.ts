import { streamText, type LanguageModel, type ModelMessage } from "ai";
import { anthropicCallCost, openaiCallCost, type CostBreakdown } from "./cost";
import type { AnthropicPriceRow, CallRecord, OpenAIPriceRow } from "./types";
import { normalizeUsage } from "./usage";

type StreamTextOptions = Parameters<typeof streamText>[0];

export type RunCallOptions = {
  model: LanguageModel;
  modelId: string;
  provider: CallRecord["provider"];
  label: string;
  scenario: CallRecord["scenario"];
  messages: ModelMessage[];
  question: string;
  maxOutputTokens: number;
  estimatedPrefixTokens: number;
  providerOptions?: StreamTextOptions["providerOptions"];
  prices: AnthropicPriceRow | OpenAIPriceRow;
};

function isAnthropicPrice(prices: AnthropicPriceRow | OpenAIPriceRow): prices is AnthropicPriceRow {
  return "cacheWrite5m" in prices;
}

export async function runModelCall(options: RunCallOptions): Promise<CallRecord> {
  const started = performance.now();
  let ttftMs: number | undefined;
  const result = streamText({
    model: options.model,
    messages: options.messages,
    maxOutputTokens: options.maxOutputTokens,
    providerOptions: options.providerOptions,
    // Cache breakpoints are attached to the system (prefix) message via
    // providerOptions. ai@7.0.173 rejects system roles in `messages`
    // unless this opt-in is set; `instructions` would drop those marks.
    allowSystemInMessages: true,
  });

  for await (const part of result.fullStream) {
    // First visible text incremental is the TTFT we record. Reasoning-only
    // prefixes are not counted as the visible first token.
    if (ttftMs == null && part.type === "text-delta") {
      ttftMs = performance.now() - started;
    }
  }

  const durationMs = performance.now() - started;
  const usage = normalizeUsage(await result.usage);
  const cost: CostBreakdown = isAnthropicPrice(options.prices)
    ? anthropicCallCost(usage, options.prices)
    : openaiCallCost(usage, options.prices);
  const warnings = ((await result.warnings) ?? []).map((warning) =>
    typeof warning === "string" ? warning : JSON.stringify(warning),
  );

  return {
    label: options.label,
    modelId: options.modelId,
    provider: options.provider,
    scenario: options.scenario,
    question: options.question,
    usage,
    inputCostUsd: cost.inputCostUsd,
    outputCostUsd: cost.outputCostUsd,
    totalCostUsd: cost.totalCostUsd,
    ttftMs,
    durationMs,
    warnings,
    estimatedPrefixTokens: options.estimatedPrefixTokens,
  };
}
