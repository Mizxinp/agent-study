export const PRICE_FETCHED_AT = "2026-11-17";

export type AnthropicTtl = "5m" | "1h";
export type OpenAITtl = "30m" | "12h";

export type AnthropicPriceRow = {
  input: number;
  cacheWrite5m: number;
  cacheWrite1h: number;
  cacheRead: number;
  output: number;
};

export type OpenAIPriceRow = {
  input: number;
  cachedInput: number;
  cacheWrite30m: number;
  cacheWrite12h: number;
  output: number;
};

export type PriceSource = {
  title: string;
  url: string;
  fetchedAt: string;
  unit: string;
};

export type NormalizedUsage = {
  inputTokens: number;
  outputTokens: number;
  noCacheTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cacheCreation5m?: number;
  cacheCreation1h?: number;
  cacheWrite30m?: number;
  cacheWrite12h?: number;
  raw?: unknown;
};

export type CallRecord = {
  label: string;
  modelId: string;
  provider: "anthropic" | "openai" | "gateway";
  scenario: "h1" | "h2" | "h3-control" | "prewarm";
  question: string;
  usage: NormalizedUsage;
  inputCostUsd: number;
  outputCostUsd: number;
  totalCostUsd: number;
  ttftMs?: number;
  durationMs: number;
  warnings: string[];
  estimatedPrefixTokens: number;
};

export type HypothesisVerdict = "支持" | "不支持" | "未运行" | "不确定";

export type HypothesisResult = {
  id: "H1" | "H2" | "H3" | "H4" | "H5";
  verdict: HypothesisVerdict;
  detail: string;
};

export type ProviderRunResult = {
  provider: "anthropic" | "openai" | "gateway";
  modelId: string;
  retrievalMode: string;
  prefixChars: number;
  estimatedPrefixTokens: number;
  minCacheableTokens: number;
  enlargedPrefix: boolean;
  priceSource: PriceSource;
  priceRow: AnthropicPriceRow | OpenAIPriceRow;
  calls: CallRecord[];
  hypotheses: HypothesisResult[];
  h3ControlKind: "calculated" | "measured";
  h1InputCostUsd?: number;
  uncachedControlInputCostUsd?: number;
  inputSavingsUsd?: number;
};

export const missingKeyMessage =
  "未运行：当前环境缺少 OPENAI_API_KEY、ANTHROPIC_API_KEY、AI_GATEWAY_API_KEY。不要用 mock 冒充 usage。设置其中至少一个变量后重新运行 pnpm eval。";
