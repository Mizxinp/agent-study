import chunks from "../data/chunks.json";
import { buildIndex, search } from "./bm25";
import { bigramTokenize } from "./tokenize";
import { embeddings } from "./embed";
import { vectorSearch } from "./vector";
import { rrf, relativeScoreFusion, type Hit } from "./fusion";
import {
  createCrossEncoderScorer,
  createRerankAdapter,
} from "./rerank-adapter";
import { rerank } from "ai";
export function retrieve(
  query: string,
  queryVector: number[],
  index: ReturnType<typeof buildIndex>,
  vectors: { id: string; embedding: number[] }[],
) {
  const bm25 = search(index, query, 30),
    vector = vectorSearch(vectors, queryVector, 30);
  return {
    bm25,
    vector,
    rrf: rrf([bm25, vector]),
    rsf: relativeScoreFusion(bm25, vector, 0.5),
  };
}
export async function rerankHits(
  query: string,
  hits: Hit[],
  model: ReturnType<typeof createRerankAdapter>,
  contextual = false,
  topN = 5,
) {
  const candidates = hits.slice(0, 30);
  const result = await rerank({
    model,
    query,
    documents: candidates.map((h) => {
      const c = chunks.find((c) => c.id === h.id)!;
      return contextual ? c.contextualText : c.text;
    }),
    topN,
    maxRetries: 0,
  });
  return result.ranking.map((r) => ({
    id: candidates[r.originalIndex].id,
    score: r.score,
  }));
}
let state:
  | Promise<{
      index: ReturnType<typeof buildIndex>;
      vectors: { id: string; embedding: number[] }[];
      model: ReturnType<typeof createRerankAdapter>;
    }>
  | undefined;
async function init() {
  const es = await embeddings(chunks.map((c) => c.text));
  return {
    index: buildIndex(chunks, bigramTokenize),
    vectors: chunks.map((c, i) => ({ id: c.id, embedding: es[i] })),
    model: createRerankAdapter(await createCrossEncoderScorer()),
  };
}
export async function searchAll(query: string) {
  state ??= init();
  const s = await state;
  const [v] = await embeddings([query], true);
  const hits = retrieve(query, v, s.index, s.vectors);
  const ranked = await rerankHits(query, hits.rrf, s.model);
  const enrich = (xs: Hit[]) =>
    xs
      .slice(0, 5)
      .map((h) => ({ ...chunks.find((c) => c.id === h.id)!, score: h.score }));
  return {
    bm25: enrich(hits.bm25),
    vector: enrich(hits.vector),
    rrf: enrich(hits.rrf),
    rerank: enrich(ranked),
  };
}
