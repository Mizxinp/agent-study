export interface Hit {
  id: string;
  score: number;
}
export const sorted = (xs: Hit[]) =>
  xs.sort(
    (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
export function rrf(lists: Hit[][], k = 60): Hit[] {
  const m = new Map<string, number>();
  for (const list of lists)
    list.forEach((x, i) => m.set(x.id, (m.get(x.id) ?? 0) + 1 / (k + i + 1)));
  return sorted([...m].map(([id, score]) => ({ id, score })));
}
export function relativeScoreFusion(
  bm25: Hit[],
  vec: Hit[],
  alpha: number,
): Hit[] {
  const m = new Map<string, number>();
  for (const [list, w] of [
    [bm25, 1 - alpha],
    [vec, alpha],
  ] as const) {
    if (!list.length) continue;
    const lo = Math.min(...list.map((x) => x.score)),
      hi = Math.max(...list.map((x) => x.score));
    for (const x of list)
      m.set(
        x.id,
        (m.get(x.id) ?? 0) + w * (hi === lo ? 1 : (x.score - lo) / (hi - lo)),
      );
  }
  return sorted([...m].map(([id, score]) => ({ id, score })));
}
