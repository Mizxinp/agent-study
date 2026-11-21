import { AsyncLocalStorage } from "node:async_hooks";

/** 记录每次 HTTP 请求的起止与状态码（不记录请求体/头，避免泄露密钥）。 */
export type RequestRecord = { start: number; end: number; status: number };

export const requestLog = new AsyncLocalStorage<RequestRecord[]>();

export const timingFetch: typeof fetch = async (input, init) => {
  const start = Date.now();
  try {
    const res = await fetch(input, init);
    requestLog.getStore()?.push({ start, end: Date.now(), status: res.status });
    return res;
  } catch (e) {
    requestLog.getStore()?.push({ start, end: Date.now(), status: 0 });
    throw e;
  }
};

/**
 * 纯函数：从墙钟延迟中扣除限流/失败重试造成的时间。
 * 对每个失败请求（状态 0、429 或 >=500），扣除「它的开始时刻 → 下一个请求开始时刻」这段（失败请求本身 + SDK 退避等待）。
 */
export function netLatency(wallMs: number, records: RequestRecord[]): { netMs: number; failedRequests: number; retryOverheadMs: number } {
  const rs = [...records].sort((a, b) => a.start - b.start);
  let overhead = 0,
    failed = 0;
  rs.forEach((r, i) => {
    const bad = r.status === 0 || r.status === 429 || r.status >= 500;
    if (!bad) return;
    failed++;
    const next = rs[i + 1];
    overhead += (next ? next.start : r.end) - r.start;
  });
  return { netMs: Math.max(0, wallMs - overhead), failedRequests: failed, retryOverheadMs: overhead };
}
