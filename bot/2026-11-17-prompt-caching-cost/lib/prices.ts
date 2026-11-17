import type {
  AnthropicPriceRow,
  OpenAIPriceRow,
  PriceSource,
} from "./types";
import { PRICE_FETCHED_AT } from "./types";

/** Official unit: USD per 1,000,000 tokens. */
export const TOKENS_PER_MILLION = 1_000_000;

export const ANTHROPIC_PRICE_SOURCE: PriceSource = {
  title: "Anthropic Claude API pricing (and the Prompt caching page table)",
  url: "https://platform.claude.com/docs/en/about-claude/pricing",
  fetchedAt: PRICE_FETCHED_AT,
  unit: "USD per 1,000,000 tokens",
};

export const OPENAI_PRICE_SOURCE: PriceSource = {
  title: "OpenAI API pricing (standard, short context) and the Prompt caching guide",
  url: "https://developers.openai.com/api/docs/pricing",
  fetchedAt: PRICE_FETCHED_AT,
  unit: "USD per 1,000,000 tokens (standard, short-context tier)",
};

/**
 * Prices copied from https://platform.claude.com/docs/en/about-claude/pricing
 * on 2026-11-17 (Asia/Shanghai). 5-minute cache writes are 1.25× base input;
 * 1-hour writes are 2×; cache hits are 0.1× except the footnote models
 * (Sonnet 5.5 / Opus 5.5 hits are 0.05×).
 */
export const ANTHROPIC_PRICES: Record<string, AnthropicPriceRow> = {
  "claude-sonnet-5-5": {
    input: 2,
    cacheWrite5m: 2.5,
    cacheWrite1h: 4,
    cacheRead: 0.1,
    output: 10,
  },
  "claude-sonnet-5": {
    input: 2,
    cacheWrite5m: 2.5,
    cacheWrite1h: 4,
    cacheRead: 0.2,
    output: 10,
  },
  "claude-sonnet-4-6": {
    input: 3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    cacheRead: 0.3,
    output: 15,
  },
  "claude-sonnet-4-5": {
    input: 3,
    cacheWrite5m: 3.75,
    cacheWrite1h: 6,
    cacheRead: 0.3,
    output: 15,
  },
  "claude-opus-5-5": {
    input: 4,
    cacheWrite5m: 5,
    cacheWrite1h: 8,
    cacheRead: 0.2,
    output: 20,
  },
  "claude-haiku-5-5": {
    input: 0.1,
    cacheWrite5m: 0.125,
    cacheWrite1h: 0.2,
    cacheRead: 0.01,
    output: 0.5,
  },
  "claude-haiku-4-5": {
    input: 1,
    cacheWrite5m: 1.25,
    cacheWrite1h: 2,
    cacheRead: 0.1,
    output: 5,
  },
};

/**
 * Standard short-context prices from
 * https://developers.openai.com/api/docs/pricing on 2026-11-17 (Asia/Shanghai).
 * Cache-write rates are total rates, not a surcharge on top of ordinary input.
 * GPT-5.6 reads are 0.1× input; 30-minute writes are 1.25×; 12-hour writes are 2.5×.
 */
export const OPENAI_PRICES: Record<string, OpenAIPriceRow> = {
  "gpt-5.6-sol": {
    input: 4,
    cachedInput: 0.4,
    cacheWrite30m: 5,
    cacheWrite12h: 10,
    output: 20,
  },
  "gpt-5.6-terra": {
    input: 2,
    cachedInput: 0.2,
    cacheWrite30m: 2.5,
    cacheWrite12h: 5,
    output: 12,
  },
  "gpt-5.6-luna": {
    input: 0.2,
    cachedInput: 0.02,
    cacheWrite30m: 0.25,
    cacheWrite12h: 0.5,
    output: 1.2,
  },
  "gpt-5.6": {
    input: 4,
    cachedInput: 0.4,
    cacheWrite30m: 5,
    cacheWrite12h: 10,
    output: 20,
  },
};

/** Minimum cacheable prefix lengths from the official prompt-caching docs (2026-11-17). */
export const ANTHROPIC_MIN_CACHEABLE_TOKENS: Record<string, number> = {
  "claude-sonnet-5-5": 512,
  "claude-opus-5-5": 512,
  "claude-opus-5": 512,
  "claude-haiku-5-5": 512,
  "claude-sonnet-5": 1024,
  "claude-opus-4-8": 1024,
  "claude-sonnet-4-6": 1024,
  "claude-sonnet-4-5": 1024,
  "claude-opus-4-7": 2048,
  "claude-opus-4-6": 4096,
  "claude-opus-4-5": 4096,
  "claude-haiku-4-5": 4096,
};

/** GPT-5.6 and later: 1,024 tokens. Hidden OpenAI system tokens do not count. */
export const OPENAI_MIN_CACHEABLE_TOKENS = 1024;

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5-5";
export const DEFAULT_OPENAI_MODEL = "gpt-5.6-sol";
export const DEFAULT_GATEWAY_MODEL = "anthropic/claude-sonnet-5-5";
export const DEFAULT_TARGET_PREFIX_TOKENS = 2048;
export const DEFAULT_MAX_OUTPUT_TOKENS = 16;

export function normalizeModelId(modelId: string): string {
  return modelId.trim().split("/").pop() ?? modelId.trim();
}

export function anthropicPriceFor(modelId: string): AnthropicPriceRow | undefined {
  return ANTHROPIC_PRICES[normalizeModelId(modelId)];
}

export function openaiPriceFor(modelId: string): OpenAIPriceRow | undefined {
  const id = normalizeModelId(modelId);
  if (OPENAI_PRICES[id]) return OPENAI_PRICES[id];
  // Family fallback for dated ids such as gpt-5.6-sol-2026-xx-xx
  const family = Object.keys(OPENAI_PRICES).find((key) => id.startsWith(key));
  return family ? OPENAI_PRICES[family] : undefined;
}

export function minCacheableTokensFor(
  provider: "anthropic" | "openai" | "gateway",
  modelId: string,
): number {
  const id = normalizeModelId(modelId);
  if (provider === "openai" || id.startsWith("gpt-")) {
    return OPENAI_MIN_CACHEABLE_TOKENS;
  }
  return ANTHROPIC_MIN_CACHEABLE_TOKENS[id] ?? 2048;
}

export function usdFromTokens(tokens: number, usdPerMillion: number): number {
  return (tokens * usdPerMillion) / TOKENS_PER_MILLION;
}
