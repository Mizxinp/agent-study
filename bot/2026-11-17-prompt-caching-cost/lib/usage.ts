import type { LanguageModelUsage } from "ai";
import type { NormalizedUsage } from "./types";

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readPath(source: unknown, path: string[]): unknown {
  let current: unknown = source;
  for (const key of path) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function isAnthropicRaw(raw: unknown): boolean {
  return (
    asNumber(readPath(raw, ["cache_read_input_tokens"])) != null ||
    asNumber(readPath(raw, ["cache_creation_input_tokens"])) != null ||
    readPath(raw, ["cache_creation"]) != null
  );
}

function isOpenAIRaw(raw: unknown): boolean {
  return (
    readPath(raw, ["input_tokens_details"]) != null ||
    readPath(raw, ["prompt_tokens_details"]) != null
  );
}

/**
 * Normalize AI SDK LanguageModelUsage plus the provider raw usage object.
 * Prefers official provider field names for cache TTL breakdowns.
 *
 * Anthropic: `input_tokens` is the uncached remainder after the last breakpoint;
 * total input = input + cache_creation + cache_read.
 * OpenAI: `input_tokens` is already the total; ordinary input =
 * input_tokens - cached_tokens - cache_write_tokens.
 */
export function normalizeUsage(usage: LanguageModelUsage | undefined | null): NormalizedUsage {
  const raw = usage?.raw;
  const rawInput = asNumber(readPath(raw, ["input_tokens"])) ?? asNumber(readPath(raw, ["prompt_tokens"]));
  const rawOutput = asNumber(readPath(raw, ["output_tokens"])) ?? asNumber(readPath(raw, ["completion_tokens"]));

  const anthropicRead = asNumber(readPath(raw, ["cache_read_input_tokens"]));
  const anthropicWrite = asNumber(readPath(raw, ["cache_creation_input_tokens"]));
  const cacheCreation5m = asNumber(
    readPath(raw, ["cache_creation", "ephemeral_5m_input_tokens"]),
  );
  const cacheCreation1h = asNumber(
    readPath(raw, ["cache_creation", "ephemeral_1h_input_tokens"]),
  );

  const openaiDetails =
    (readPath(raw, ["input_tokens_details"]) as Record<string, unknown> | undefined) ??
    (readPath(raw, ["prompt_tokens_details"]) as Record<string, unknown> | undefined);
  const openaiRead = asNumber(openaiDetails?.cached_tokens);
  const openaiWrite = asNumber(openaiDetails?.cache_write_tokens);
  const cacheWrite30m = asNumber(
    readPath(openaiDetails, ["cache_write_tokens_details", "ttl_30m_tokens"]),
  );
  const cacheWrite12h = asNumber(
    readPath(openaiDetails, ["cache_write_tokens_details", "ttl_12h_tokens"]),
  );

  const cacheReadTokens =
    anthropicRead ??
    openaiRead ??
    usage?.inputTokenDetails.cacheReadTokens ??
    0;
  const cacheWriteTokens =
    anthropicWrite ??
    openaiWrite ??
    usage?.inputTokenDetails.cacheWriteTokens ??
    0;

  let noCacheTokens: number;
  if (isAnthropicRaw(raw)) {
    noCacheTokens = asNumber(readPath(raw, ["input_tokens"])) ?? usage?.inputTokenDetails.noCacheTokens ?? 0;
  } else if (isOpenAIRaw(raw)) {
    noCacheTokens =
      usage?.inputTokenDetails.noCacheTokens ??
      Math.max(0, (rawInput ?? 0) - cacheReadTokens - cacheWriteTokens);
  } else {
    noCacheTokens =
      usage?.inputTokenDetails.noCacheTokens ??
      Math.max(0, (usage?.inputTokens ?? rawInput ?? 0) - cacheReadTokens - cacheWriteTokens);
  }

  const inputTokens = isAnthropicRaw(raw)
    ? (usage?.inputTokens ?? noCacheTokens + cacheReadTokens + cacheWriteTokens)
    : (usage?.inputTokens ?? rawInput ?? noCacheTokens + cacheReadTokens + cacheWriteTokens);
  const outputTokens = rawOutput ?? usage?.outputTokens ?? 0;

  return {
    inputTokens,
    outputTokens,
    noCacheTokens,
    cacheReadTokens,
    cacheWriteTokens,
    ...(cacheCreation5m != null ? { cacheCreation5m } : {}),
    ...(cacheCreation1h != null ? { cacheCreation1h } : {}),
    ...(cacheWrite30m != null ? { cacheWrite30m } : {}),
    ...(cacheWrite12h != null ? { cacheWrite12h } : {}),
    raw,
  };
}

export function looksUncached(usage: NormalizedUsage): boolean {
  return usage.cacheReadTokens === 0 && usage.cacheWriteTokens === 0;
}
