import { pipeline } from "@huggingface/transformers";
import { embedMany } from "ai";
import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cacheDir, maybeReuseLocalBgeCache, sessionOptions } from "./model-env";

export const embeddingConfig = {
  model: "Xenova/bge-small-zh-v1.5",
  dtype: "q8",
  pooling: "cls",
  normalize: true,
  prefix: "为这个句子生成表示以用于检索相关文章：",
} as const;

let extractor: ReturnType<typeof pipeline<"feature-extraction">> | undefined;

export async function inferTextEmbeddings(texts: string[]): Promise<number[][]> {
  maybeReuseLocalBgeCache();
  extractor ??= pipeline("feature-extraction", embeddingConfig.model, {
    dtype: embeddingConfig.dtype,
    session_options: sessionOptions,
  });
  const pipe = await extractor;
  const tensor = await pipe(texts, { pooling: "cls", normalize: true });
  return tensor.tolist() as number[][];
}

export const localEmbeddingModel: EmbeddingModelV4 = {
  specificationVersion: "v4",
  provider: "local",
  modelId: embeddingConfig.model,
  maxEmbeddingsPerCall: 4,
  supportsParallelCalls: false,
  async doEmbed({ values }) {
    return { embeddings: await inferTextEmbeddings(values), warnings: [] };
  },
};

export async function textEmbeddings(
  texts: string[],
  isQuery = false,
  prefix = true,
) {
  const values = texts.map((t) =>
    isQuery && prefix ? embeddingConfig.prefix + t : t,
  );
  const hash = createHash("sha256")
    .update(
      JSON.stringify({ config: embeddingConfig, isQuery, prefix, values }),
    )
    .digest("hex");
  const file = `${cacheDir}/bge-embeddings-${hash}.json`;
  try {
    return JSON.parse(await readFile(file, "utf8")) as number[][];
  } catch {}
  await mkdir(cacheDir, { recursive: true });
  const result = await embedMany({
    model: localEmbeddingModel,
    values,
    maxParallelCalls: 1,
    maxRetries: 0,
  });
  await writeFile(file, JSON.stringify(result.embeddings));
  return result.embeddings;
}
