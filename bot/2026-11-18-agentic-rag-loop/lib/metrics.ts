export function normalizeSkus(skus: readonly string[]): string[] {
  return [...new Set(skus.map((s) => s.trim().toUpperCase()).filter(Boolean))].sort();
}

/** 集合精确匹配；gold 为空集表示「无」，此时预测也须为空集。预测为 null（未给出答案）一律算错。 */
export function exactMatch(pred: readonly string[] | null, gold: readonly string[]): boolean {
  if (pred == null) return false;
  const a = normalizeSkus(pred),
    b = normalizeSkus(gold);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export function setF1(pred: readonly string[] | null, gold: readonly string[]): number {
  if (pred == null) return 0;
  const a = new Set(normalizeSkus(pred)),
    b = new Set(normalizeSkus(gold));
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const tp = [...a].filter((x) => b.has(x)).length;
  if (tp === 0) return 0;
  const p = tp / a.size,
    r = tp / b.size;
  return (2 * p * r) / (p + r);
}

/** 线性插值分位数（与 numpy 默认 linear 一致）。 */
export function percentile(values: readonly number[], q: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((x, y) => x - y);
  const pos = (s.length - 1) * q,
    lo = Math.floor(pos),
    hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const mean = (xs: readonly number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;

/** 精确符号检验（双侧），用于配对比较 agentic vs fixed 的逐题对错。 */
export function signTestP(wins: number, losses: number): number {
  const n = wins + losses;
  if (n === 0) return 1;
  const k = Math.min(wins, losses);
  let c = 1,
    tail = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = (c * (n - i + 1)) / i;
    if (i <= k) tail += c;
  }
  return Math.min(1, (2 * tail) / 2 ** n);
}
