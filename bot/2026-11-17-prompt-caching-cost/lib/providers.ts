import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";
import { detectKeys, type AvailableKeys } from "./keys";
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_GATEWAY_MODEL,
  DEFAULT_OPENAI_MODEL,
  anthropicPriceFor,
  minCacheableTokensFor,
  openaiPriceFor,
} from "./prices";
import type { AnthropicPriceRow, OpenAIPriceRow } from "./types";

export type RunnableProvider = {
  provider: "anthropic" | "openai" | "gateway";
  modelId: string;
  model: LanguageModel;
  prices: AnthropicPriceRow | OpenAIPriceRow;
  minCacheableTokens: number;
  priceKind: "anthropic" | "openai";
};

export function selectProviders(env: NodeJS.ProcessEnv = process.env): RunnableProvider[] {
  const keys: AvailableKeys = detectKeys(env);
  const selected: RunnableProvider[] = [];

  if (keys.anthropic) {
    const modelId = env.ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;
    const prices = anthropicPriceFor(modelId);
    if (!prices) {
      throw new Error(
        `No official Anthropic unit prices are recorded for model "${modelId}". Add a row in lib/prices.ts (do not invent a bill).`,
      );
    }
    selected.push({
      provider: "anthropic",
      modelId,
      model: createAnthropic()(modelId),
      prices,
      minCacheableTokens: minCacheableTokensFor("anthropic", modelId),
      priceKind: "anthropic",
    });
  }

  if (keys.openai) {
    const modelId = env.OPENAI_MODEL?.trim() || DEFAULT_OPENAI_MODEL;
    const prices = openaiPriceFor(modelId);
    if (!prices) {
      throw new Error(
        `No official OpenAI unit prices are recorded for model "${modelId}". Add a row in lib/prices.ts (do not invent a bill).`,
      );
    }
    selected.push({
      provider: "openai",
      modelId,
      model: createOpenAI()(modelId), // defaults to the Responses API in @ai-sdk/openai@4.0.118
      prices,
      minCacheableTokens: minCacheableTokensFor("openai", modelId),
      priceKind: "openai",
    });
  }

  if (selected.length === 0 && keys.gateway) {
    const modelId = env.GATEWAY_MODEL?.trim() || DEFAULT_GATEWAY_MODEL;
    const priceKind = modelId.includes("openai") || modelId.includes("gpt-") ? "openai" : "anthropic";
    const prices = priceKind === "openai" ? openaiPriceFor(modelId) : anthropicPriceFor(modelId);
    if (!prices) {
      throw new Error(
        `No official unit prices are recorded for gateway model "${modelId}". Add a row in lib/prices.ts.`,
      );
    }
    selected.push({
      provider: "gateway",
      modelId,
      model: gateway(modelId),
      prices,
      minCacheableTokens: minCacheableTokensFor(priceKind, modelId),
      priceKind,
    });
  }

  return selected;
}
