export function cosine(a: number[], b: number[]) {
  if (a.length !== b.length) throw new Error("Embedding dimensions differ");
  const norm = Math.hypot(...a) * Math.hypot(...b);
  return norm ? a.reduce((s, v, i) => s + v * b[i], 0) / norm : 0;
}
export function terms(text: string): string[] {
  return text.toLowerCase().match(/[\p{Script=Han}]|[a-z0-9]+/gu) ?? [];
}
export function bm25(query: string, documents: string[]) {
  const docs = documents.map(terms),
    q = [...new Set(terms(query))];
  const avg = docs.reduce((s, d) => s + d.length, 0) / (docs.length || 1);
  return docs.map((d) =>
    q.reduce((s, t) => {
      const f = d.filter((x) => x === t).length,
        df = docs.filter((x) => x.includes(t)).length;
      return (
        s +
        (Math.log(1 + (docs.length - df + 0.5) / (df + 0.5)) * f * 2.2) /
          (f + 1.2 * (0.25 + (0.75 * d.length) / (avg || 1)))
      );
    }, 0),
  );
}
