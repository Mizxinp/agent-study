import { cosineSimilarity } from "ai";
import { sorted } from "./fusion";
import type { Hit } from "./types";

export function vectorSearch(
  docs: { id: string; embedding: number[] }[],
  query: number[],
  topK: number,
): Hit[] {
  return sorted(
    docs.map((d) => ({
      id: d.id,
      score: cosineSimilarity(d.embedding, query),
    })),
  ).slice(0, topK);
}
