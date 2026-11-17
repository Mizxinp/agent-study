import type { RerankingModelV4 } from "@ai-sdk/provider";
import {
  AutoTokenizer,
  AutoModelForSequenceClassification,
} from "@huggingface/transformers";
import { sessionOptions } from "./model-env";
export type ScoreFn = (query: string, documents: string[]) => Promise<number[]>;
export const rerankConfig = {
  model: "Xenova/bge-reranker-base",
  dtype: "q8",
  batch: 4,
  maxLength: 256,
} as const;
export function createRerankAdapter(
  scoreFn: ScoreFn,
  modelId = rerankConfig.model,
): RerankingModelV4 {
  return {
    specificationVersion: "v4",
    provider: "local",
    modelId,
    async doRerank({ query, documents, topN }) {
      if (documents.type !== "text")
        throw new Error("Only text documents supported");
      const scores = await scoreFn(query, documents.values);
      if (
        scores.length !== documents.values.length ||
        scores.some((x) => !Number.isFinite(x))
      )
        throw new Error("Invalid scores");
      return {
        ranking: scores
          .map((relevanceScore, index) => ({ index, relevanceScore }))
          .sort(
            (a, b) => b.relevanceScore - a.relevanceScore || a.index - b.index,
          )
          .slice(0, topN),
        warnings: [],
      };
    },
  };
}
export async function createCrossEncoderScorer(): Promise<ScoreFn> {
  const tokenizer = await AutoTokenizer.from_pretrained(rerankConfig.model);
  const model = await AutoModelForSequenceClassification.from_pretrained(
    rerankConfig.model,
    { dtype: rerankConfig.dtype, session_options: sessionOptions },
  );
  return async (query, docs) => {
    const scores: number[] = [];
    for (let i = 0; i < docs.length; i += rerankConfig.batch) {
      const batch = docs.slice(i, i + rerankConfig.batch);
      const input = await tokenizer(
        batch.map(() => query),
        {
          text_pair: batch,
          padding: true,
          truncation: true,
          max_length: rerankConfig.maxLength,
        },
      );
      const { logits } = await model(input);
      scores.push(
        ...Array.from(
          logits.data as Float32Array,
          (x) => 1 / (1 + Math.exp(-x)),
        ),
      );
    }
    return scores;
  };
}
