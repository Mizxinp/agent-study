/**
 * Resolve and join provider base URLs.
 *
 * Installed SDK behavior (verified in @ai-sdk/anthropic@4.0.105 and
 * @ai-sdk/openai@4.0.118):
 * - createOpenAI reads options.baseURL or OPENAI_BASE_URL, default
 *   https://api.openai.com/v1, then builds `${baseURL}${path}` where path
 *   is `/chat/completions`, `/responses`, or `/embeddings`.
 * - createAnthropic reads options.baseURL or ANTHROPIC_BASE_URL, default
 *   https://api.anthropic.com/v1, then appends `/messages`. It only
 *   auto-appends `/v1` when the value is exactly https://api.anthropic.com.
 *
 * Callers should pass a base that already includes `/v1` so the final
 * URLs land on `/v1/chat/completions` or `/v1/messages` without a doubled
 * `/v1`. This helper also accepts the CR_* aliases.
 */

export function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

export type EnvMap = { [key: string]: string | undefined };

function firstSetBase(values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return stripTrailingSlash(trimmed);
  }
  return undefined;
}

export function resolveOpenAIBaseURL(env: EnvMap = process.env): string | undefined {
  return firstSetBase([env.OPENAI_BASE_URL, env.CR_OPENAI_BASE_URL]);
}

export function resolveAnthropicBaseURL(env: EnvMap = process.env): string | undefined {
  return firstSetBase([env.ANTHROPIC_BASE_URL, env.CR_ANTHROPIC_BASE_URL]);
}

export function joinOpenAIUrl(baseURL: string, path: string): string {
  const base = stripTrailingSlash(baseURL);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

export function joinAnthropicMessagesUrl(baseURL: string): string {
  return joinOpenAIUrl(baseURL, "/messages");
}
