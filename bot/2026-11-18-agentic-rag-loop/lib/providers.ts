import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

/**
 * CR 兼容端点接线（思路参考 2026-11-17-prompt-caching-cost/lib/providers.ts，未修改原文件）：
 * - @ai-sdk/anthropic 在 baseURL 后追加 `/messages`，只有官方域名才自动补 `/v1`，所以 base 必须自带 `/v1`；
 *   自定义 Anthropic 兼容 base 额外发 `Authorization: Bearer`。
 * - @ai-sdk/openai 在 baseURL 后追加 `/chat/completions` 或 `/responses`，base 也须自带 `/v1`。
 * 始终显式传 baseURL，避免打到官方端点。不打印任何密钥。
 */
export const stripSlash = (u: string) => u.trim().replace(/\/+$/, "");

export type ProviderKind = "anthropic" | "openai";
export type EnvMap = Record<string, string | undefined>;

export function resolveLlmConfig(env: EnvMap = process.env):
  | { ok: true; provider: ProviderKind; modelId: string; baseURL: string }
  | { ok: false; reason: string } {
  const provider = (env.LLM_PROVIDER?.trim() || "anthropic") as ProviderKind;
  if (provider !== "anthropic" && provider !== "openai")
    return { ok: false, reason: `未知 LLM_PROVIDER=${provider}` };
  const key = provider === "anthropic" ? env.ANTHROPIC_API_KEY : env.OPENAI_API_KEY;
  const base = provider === "anthropic" ? env.ANTHROPIC_BASE_URL : env.OPENAI_BASE_URL;
  if (!key?.trim())
    return { ok: false, reason: `缺少 ${provider === "anthropic" ? "ANTHROPIC_API_KEY" : "OPENAI_API_KEY"}` };
  if (!base?.trim())
    return { ok: false, reason: `缺少 ${provider === "anthropic" ? "ANTHROPIC_BASE_URL" : "OPENAI_BASE_URL"}（必须显式给出 CR 兼容 base，含 /v1）` };
  const baseURL = stripSlash(base);
  if (!/\/v1$/.test(baseURL))
    return { ok: false, reason: `baseURL 须以 /v1 结尾（SDK 只追加 /messages 或 /chat/completions）` };
  const modelId = env.LLM_MODEL?.trim() || "claude-haiku-5-5";
  return { ok: true, provider, modelId, baseURL };
}

export function createLlm(env: EnvMap = process.env): {
  model: LanguageModel;
  provider: ProviderKind;
  modelId: string;
  baseHost: string;
} {
  const cfg = resolveLlmConfig(env);
  if (!cfg.ok) throw new Error(`LLM 未配置：${cfg.reason}`);
  const baseHost = new URL(cfg.baseURL).host;
  if (cfg.provider === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY!.trim();
    const anthropic = createAnthropic({
      baseURL: cfg.baseURL,
      apiKey,
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    return { model: anthropic(cfg.modelId), provider: cfg.provider, modelId: cfg.modelId, baseHost };
  }
  const openai = createOpenAI({ baseURL: cfg.baseURL, apiKey: env.OPENAI_API_KEY!.trim() });
  // CR 文档列出的是 /v1/chat/completions，所以用 chat 而不是默认的 responses。
  return { model: openai.chat(cfg.modelId), provider: cfg.provider, modelId: cfg.modelId, baseHost };
}
