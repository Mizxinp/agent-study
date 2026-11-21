import { buildIndex, search as bm25Search } from "./bm25";
import { corpus, type Chunk } from "./data";
import { embeddings } from "./embed";
import { rrf, type Hit } from "./fusion";
import { bigramTokenize } from "./tokenize";
import { vectorSearch } from "./vector";

export const retrievalConfig = {
  bm25Tokenizer: "bigram（汉字二元组 + 型号整体及分段）",
  candidatesPerLane: 30,
  fusion: "RRF k=60",
  embeddingText: "contextualText（标题+型号+小节前缀）",
} as const;

export type RetrievedChunk = Chunk & { score: number; rank: number };

let state:
  | Promise<{
      index: ReturnType<typeof buildIndex>;
      vectors: { id: string; embedding: number[] }[];
    }>
  | undefined;

async function init() {
  const es = await embeddings(corpus.map((c) => c.text));
  return {
    index: buildIndex(corpus, bigramTokenize),
    vectors: corpus.map((c, i) => ({ id: c.id, embedding: es[i] })),
  };
}

/** 纯函数部分：把 BM25 与向量两路结果做 RRF 融合并取 topK。 */
export function fuseTopK(bm25: Hit[], vector: Hit[], topK: number): Hit[] {
  return rrf([bm25, vector]).slice(0, topK);
}

export async function hybridSearch(
  query: string,
  topK = 8,
): Promise<RetrievedChunk[]> {
  state ??= init();
  const { index, vectors } = await state;
  const [qv] = await embeddings([query], true);
  const n = retrievalConfig.candidatesPerLane;
  const fused = fuseTopK(bm25Search(index, query, n), vectorSearch(vectors, qv, n), topK);
  const byId = new Map(corpus.map((c) => [c.id, c]));
  return fused.map((h, i) => ({ ...byId.get(h.id)!, score: h.score, rank: i + 1 }));
}

export function formatChunks(chunks: RetrievedChunk[]): string {
  return chunks.map((c) => `[${c.rank}] (${c.id}) ${c.text}`).join("\n\n");
}
