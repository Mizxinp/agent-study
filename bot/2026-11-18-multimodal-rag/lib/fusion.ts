import type { Hit } from "./types";

export const sorted = (xs: Hit[]) =>
  xs.sort(
    (a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );

export function l2normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  if (!n) throw new Error("cannot normalize a zero vector");
  return v.map((x) => x / n);
}

export function averageFuse(text: number[], image: number[]): number[] {
  if (text.length !== image.length) {
    throw new Error(
      `fusion requires same-length vectors, got ${text.length} and ${image.length}`,
    );
  }
  const t = l2normalize(text);
  const i = l2normalize(image);
  return l2normalize(t.map((x, idx) => x + i[idx]));
}
