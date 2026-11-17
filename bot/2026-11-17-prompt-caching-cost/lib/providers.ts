import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { gateway, type LanguageModel } from "ai";
import { resolveAnthropicBaseURL, resolveOpenAIBaseURL } from "./base-url";
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

function skipOpenAI(env: NodeJS.ProcessEnv): boolean {
  const raw = env.EVAL_SKIP_OPENAI?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Extra Authorization header for CR-compatible Anthropic bases. Official Anthropic stays x-api-key only. */
export function anthropicProviderHeaders(
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string> | undefined {
  const baseURL = resolveAnthropicBaseURL(env);
  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!baseURL || !key) return undefined;
  return { Authorization: `Bearer ${key}` };
}

export function createAnthropicProvider(env: NodeJS.ProcessEnv = process.env) {
  const baseURL = resolveAnthropicBaseURL(env);
  const headers = anthropicProviderHeaders(env);
  return createAnthropic({
    ...(baseURL ? { baseURL } : {}),
    ...(headers ? { headers } : {}),
  });
}

export function createOpenAIProvider(env: NodeJS.ProcessEnv = process.env) {
  const baseURL = resolveOpenAIBaseURL(env);
  return createOpenAI({
    ...(baseURL ? { baseURL } : {}),
  });
}

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
      model: createAnthropicProvider(env)(modelId),
      prices,
      minCacheableTokens: minCacheableTokensFor("anthropic", modelId),
      priceKind: "anthropic",
    });
  }

  if (keys.openai && !skipOpenAI(env)) {
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
      // defaults to the Responses API in @ai-sdk/openai@4.0.118
      model: createOpenAIProvider(env)(modelId),
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
