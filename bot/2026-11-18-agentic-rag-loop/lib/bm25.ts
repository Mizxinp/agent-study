import type { Tokenizer } from "./tokenize";
import { sorted } from "./fusion";
export function buildIndex(
  docs: { id: string; text: string }[],
  tokenizer: Tokenizer,
) {
  const df = new Map<string, number>();
  const rows = docs.map((d) => {
    const tokens = tokenizer(d.text),
      tf = new Map<string, number>();
    for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    return { id: d.id, length: tokens.length, tf };
  });
  return {
    rows,
    df,
    avg: rows.reduce((s, r) => s + r.length, 0) / rows.length,
    tokenizer,
  };
}
export function search(
  index: ReturnType<typeof buildIndex>,
  query: string,
  topK: number,
) {
  const terms = [...new Set(index.tokenizer(query))],
    N = index.rows.length;
  return sorted(
    index.rows.map((r) => ({
      id: r.id,
      score: terms.reduce((s, t) => {
        const f = r.tf.get(t) ?? 0,
          df = index.df.get(t) ?? 0;
        return (
          s +
          (f
            ? (Math.log(1 + (N - df + 0.5) / (df + 0.5)) * f * 2.2) /
              (f + 1.2 * (0.25 + (0.75 * r.length) / index.avg))
            : 0)
        );
      }, 0),
    })),
  ).slice(0, topK);
}
