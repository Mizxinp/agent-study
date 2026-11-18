export function recallAtK(ids: string[], rel: string[], k: number) {
  const r = new Set(rel);
  return r.size
    ? [...new Set(ids.slice(0, k))].filter((x) => r.has(x)).length / r.size
    : 0;
}

export function mrrAtK(ids: string[], rel: string[], k: number) {
  const i = ids.slice(0, k).findIndex((x) => rel.includes(x));
  return i < 0 ? 0 : 1 / (i + 1);
}

export function ndcgAtK(ids: string[], rel: string[], k: number) {
  const dcg = ids
    .slice(0, k)
    .reduce((s, x, i) => s + (rel.includes(x) ? 1 / Math.log2(i + 2) : 0), 0);
  const ideal = Array.from(
    { length: Math.min(new Set(rel).size, k) },
    (_, i) => 1 / Math.log2(i + 2),
  ).reduce((a, b) => a + b, 0);
  return ideal ? dcg / ideal : 0;
}

export function mean(xs: number[]) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
