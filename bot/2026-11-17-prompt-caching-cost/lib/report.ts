import type { CallRecord, HypothesisResult, ProviderRunResult } from "./types";

function usd(value: number | undefined): string {
  if (value == null) return "—";
  return `${value.toExponential(6)} USD`;
}

function usageLine(usage: CallRecord["usage"]): string {
  const extra: string[] = [];
  if (usage.cacheCreation5m != null || usage.cacheCreation1h != null) {
    extra.push(`cache_creation 5m=${usage.cacheCreation5m ?? 0} 1h=${usage.cacheCreation1h ?? 0}`);
  }
  if (usage.cacheWrite30m != null || usage.cacheWrite12h != null) {
    extra.push(`cache_write 30m=${usage.cacheWrite30m ?? 0} 12h=${usage.cacheWrite12h ?? 0}`);
  }
  return [
    `input=${usage.inputTokens}`,
    `noCache=${usage.noCacheTokens}`,
    `cacheWrite=${usage.cacheWriteTokens}`,
    `cacheRead=${usage.cacheReadTokens}`,
    `output=${usage.outputTokens}`,
    ...extra,
  ].join(", ");
}

function formatCall(call: CallRecord): string {
  const ttft = call.ttftMs == null ? "未采集" : `${call.ttftMs.toFixed(0)} ms`;
  return [
    `- **${call.label}**`,
    `  - 问题：${call.question}`,
    `  - usage：${usageLine(call.usage)}`,
    `  - 估算成本：输入 ${usd(call.inputCostUsd)}，输出 ${usd(call.outputCostUsd)}，合计 ${usd(call.totalCostUsd)}`,
    `  - 耗时：总 ${call.durationMs.toFixed(0)} ms，TTFT ${ttft}`,
  ].join("\n");
}

function formatHypothesis(item: HypothesisResult): string {
  return `### ${item.id}：${item.verdict}\n\n${item.detail}`;
}

export function formatProviderMarkdown(run: ProviderRunResult): string {
  const prewarm = run.calls.filter((call) => call.scenario === "prewarm");
  const lines = [
    `## 提供商 ${run.provider} / 模型 \`${run.modelId}\``,
    "",
    `- 检索 / 断点模式：${run.retrievalMode}`,
    `- 稳定前缀：约 ${run.estimatedPrefixTokens} tokens（${run.prefixChars} 字符，chars/4 估算）${run.enlargedPrefix ? "；因首次低于最低可缓存长度已加长" : ""}`,
    `- 文档中的最低可缓存长度：${run.minCacheableTokens} tokens`,
    `- 单价来源：${run.priceSource.title}，抓取日期 ${run.priceSource.fetchedAt}，单位 ${run.priceSource.unit}，文档 ${run.priceSource.url}`,
    `- 使用的单价：${JSON.stringify(run.priceRow)}`,
    `- H3 对照：${run.h3ControlKind === "calculated" ? "算术对照（两次都按未缓存输入单价计价），不是第三次关缓存实测" : "实测关缓存对照"}`,
    `- H1 两次输入成本 ${usd(run.h1InputCostUsd)}，未缓存对照 ${usd(run.uncachedControlInputCostUsd)}，差额 ${usd(run.inputSavingsUsd)}`,
    "",
    "### 调用记录",
    "",
    ...run.calls.map(formatCall),
  ];
  if (prewarm.length > 0) {
    lines.push("", "预热（warmup）成本已单列在上面的 prewarm 调用中，不计入 H1 的两次请求对比。");
  }
  lines.push("", ...run.hypotheses.map(formatHypothesis), "");
  return lines.join("\n");
}

export function formatResultsMarkdown(runs: ProviderRunResult[], meta: { node: string; pnpm: string; generatedAt: string }): string {
  return [
    "# Prompt caching 评测结果",
    "",
    `生成时间（Asia/Shanghai）：${meta.generatedAt}`,
    `Node ${meta.node}，pnpm ${meta.pnpm}`,
    "",
    "下列数字来自真实 API `usage` 字段与官方单价的估算，不是账单。",
    "",
    ...runs.map(formatProviderMarkdown),
  ].join("\n");
}
