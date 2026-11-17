import type { CallRecord, HypothesisResult, NormalizedUsage } from "./types";

function closeTo(a: number, b: number, tolerance = 0.15): boolean {
  if (b === 0) return a === 0;
  return Math.abs(a - b) / b <= tolerance;
}

export function judgeH1(first: NormalizedUsage, second: NormalizedUsage): HypothesisResult {
  const wrote =
    first.cacheWriteTokens > 0 || (first.cacheReadTokens === 0 && second.cacheReadTokens > 0);
  const hit = second.cacheReadTokens > 0;
  const readCloseToWrite =
    first.cacheWriteTokens > 0 ? closeTo(second.cacheReadTokens, first.cacheWriteTokens) : hit;
  const uncachedSmaller = second.noCacheTokens < first.inputTokens;

  if (wrote && hit && (readCloseToWrite || uncachedSmaller)) {
    return {
      id: "H1",
      verdict: "支持",
      detail: `第一次写入 cacheWrite=${first.cacheWriteTokens} / cacheRead=${first.cacheReadTokens}；第二次命中 cacheRead=${second.cacheReadTokens}，noCache=${second.noCacheTokens}（第一次 total input=${first.inputTokens}）。`,
    };
  }
  if (!wrote && !hit) {
    return {
      id: "H1",
      verdict: "不支持",
      detail: `两次都没有写入或命中（第一次 write=${first.cacheWriteTokens} read=${first.cacheReadTokens}；第二次 write=${second.cacheWriteTokens} read=${second.cacheReadTokens}）。若两次 input 都低于最低可缓存长度，应先加长稳定前缀再判定。`,
    };
  }
  return {
    id: "H1",
    verdict: "不确定",
    detail: `字段不完整或不典型：第一次 write=${first.cacheWriteTokens} read=${first.cacheReadTokens}；第二次 write=${second.cacheWriteTokens} read=${second.cacheReadTokens}，noCache=${second.noCacheTokens}。如实记录，不改数字。`,
  };
}

export function judgeH2(first: NormalizedUsage, second: NormalizedUsage): HypothesisResult {
  const looksLikeH1Hit =
    first.cacheWriteTokens > 0 &&
    second.cacheReadTokens > 0 &&
    closeTo(second.cacheReadTokens, first.cacheWriteTokens);
  const mostlyWrites =
    first.cacheReadTokens === 0 &&
    second.cacheReadTokens === 0 &&
    (first.cacheWriteTokens > 0 || second.cacheWriteTokens > 0);
  const nearZeroCache =
    first.cacheReadTokens === 0 &&
    second.cacheReadTokens === 0 &&
    first.cacheWriteTokens === 0 &&
    second.cacheWriteTokens === 0;

  if (looksLikeH1Hit) {
    return {
      id: "H2",
      verdict: "不支持",
      detail: `第二次 cacheRead=${second.cacheReadTokens} 接近第一次写入 ${first.cacheWriteTokens}，表现得像 H1 命中。不可把断点打在变化块上的请求当成「未命中」而不记录真实字段。`,
    };
  }
  if (mostlyWrites || nearZeroCache) {
    return {
      id: "H2",
      verdict: "支持",
      detail: `两次主要是写入或缓存字段接近 0（第一次 write=${first.cacheWriteTokens} read=${first.cacheReadTokens}；第二次 write=${second.cacheWriteTokens} read=${second.cacheReadTokens}），不像 H1 那样的前缀命中。`,
    };
  }
  return {
    id: "H2",
    verdict: "不确定",
    detail: `可能出现提供商隐式断点或部分命中：第一次 write=${first.cacheWriteTokens} read=${first.cacheReadTokens}；第二次 write=${second.cacheWriteTokens} read=${second.cacheReadTokens}。如实记录字段，不改数字。`,
  };
}

export function judgeH3(cachedInputCost: number, uncachedInputCost: number, controlKind: "calculated" | "measured"): HypothesisResult {
  if (cachedInputCost < uncachedInputCost) {
    return {
      id: "H3",
      verdict: "支持",
      detail: `H1 两次请求输入成本 ${cachedInputCost.toExponential(6)} USD，低于对照 ${uncachedInputCost.toExponential(6)} USD（对照为${controlKind === "calculated" ? "按未缓存输入单价计算的算术对照，不是第三次实测关缓存请求" : "第三次关闭缓存的实测对照"}）。`,
    };
  }
  if (cachedInputCost >= uncachedInputCost) {
    return {
      id: "H3",
      verdict: "不支持",
      detail: `H1 两次输入成本 ${cachedInputCost.toExponential(6)} USD，不低于对照 ${uncachedInputCost.toExponential(6)} USD（${controlKind}）。`,
    };
  }
  return { id: "H3", verdict: "不确定", detail: "缺少成本数字。" };
}

export function judgeH4(first: CallRecord, second: CallRecord): HypothesisResult {
  if (first.ttftMs == null || second.ttftMs == null) {
    return {
      id: "H4",
      verdict: "不确定",
      detail: "缺少 TTFT 样本，无法判断命中是否更快。",
    };
  }
  return {
    id: "H4",
    verdict: "不确定",
    detail: `仅有一次配对样本：第一次 TTFT ${first.ttftMs.toFixed(0)} ms，第二次 ${second.ttftMs.toFixed(0)} ms（${second.ttftMs < first.ttftMs ? "第二次更快" : "第二次未更快"}）。样本少、波动可能很大，不把单次差异写成确定结论。`,
  };
}
