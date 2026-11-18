import { existsSync } from "node:fs";
import { averageFuse } from "./fusion";
import {
  loadCatalog,
  loadQuerySet,
  skuImagePath,
  glazeById,
} from "./catalog";
import { writeSkuImages } from "./generate-image";
import { textEmbeddings } from "./text-embed";
import {
  clipImageEmbeddingFromBuffer,
  clipImageEmbeddings,
  clipTextEmbeddings,
  visionConfig,
} from "./vision-embed";
import { vectorSearch } from "./vector";
import { embeddingConfig } from "./text-embed";
import type { Hit, Sku } from "./types";

export type Lane = "text-bge" | "text-clip" | "vision" | "fusion";

export type IndexedSku = Sku & {
  bge: number[];
  clipText: number[];
  clipImage: number[];
  fusion: number[];
};

export type SearchResult = {
  lanes: Record<Lane, Hit[]>;
  models: {
    text: typeof embeddingConfig;
    vision: typeof visionConfig;
    fusion: "l2-average of Chinese-CLIP caption text and image vectors";
  };
};

let indexPromise: Promise<IndexedSku[]> | null = null;

export async function ensureImages(): Promise<void> {
  const catalog = loadCatalog();
  const missing = catalog.skus.filter((s) => !existsSync(skuImagePath(s)));
  if (!missing.length) return;
  await writeSkuImages(catalog.skus, catalog.glazes);
}

export async function buildIndex(): Promise<IndexedSku[]> {
  indexPromise ??= (async () => {
    await ensureImages();
    const catalog = loadCatalog();
    const paths = catalog.skus.map(skuImagePath);
    const [bge, clipText, clipImage] = await Promise.all([
      textEmbeddings(catalog.skus.map((s) => s.caption), false, true),
      clipTextEmbeddings(catalog.skus.map((s) => `${s.caption} ${s.description}`)),
      clipImageEmbeddings(paths),
    ]);
    return catalog.skus.map((sku, i) => ({
      ...sku,
      bge: bge[i],
      clipText: clipText[i],
      clipImage: clipImage[i],
      fusion: averageFuse(clipText[i], clipImage[i]),
    }));
  })();
  return indexPromise;
}

export async function searchText(query: string, topK = 5): Promise<SearchResult> {
  const index = await buildIndex();
  const [bgeQ] = await textEmbeddings([query], true, true);
  const [clipQ] = await clipTextEmbeddings([query]);
  return {
    lanes: {
      "text-bge": vectorSearch(index.map((s) => ({ id: s.id, embedding: s.bge })), bgeQ, topK),
      "text-clip": vectorSearch(index.map((s) => ({ id: s.id, embedding: s.clipText })), clipQ, topK),
      vision: vectorSearch(index.map((s) => ({ id: s.id, embedding: s.clipImage })), clipQ, topK),
      fusion: vectorSearch(index.map((s) => ({ id: s.id, embedding: s.fusion })), clipQ, topK),
    },
    models: {
      text: embeddingConfig,
      vision: visionConfig,
      fusion: "l2-average of Chinese-CLIP caption text and image vectors",
    },
  };
}

export async function searchImage(
  image: Buffer,
  options: { topK?: number; excludeIds?: string[] } = {},
): Promise<SearchResult> {
  const topK = options.topK ?? 5;
  const exclude = new Set(options.excludeIds ?? []);
  const index = (await buildIndex()).filter((s) => !exclude.has(s.id));
  const imageQ = await clipImageEmbeddingFromBuffer(image);
  // 以图搜图时，文本路没有查询图，退回空查询不可用；H3 的文本对照用查询图字幕，由调用方另行检索。
  // 这里视觉路与融合路都用查询图向量（融合库向量仍是字幕+图平均）。
  return {
    lanes: {
      "text-bge": [],
      "text-clip": [],
      vision: vectorSearch(index.map((s) => ({ id: s.id, embedding: s.clipImage })), imageQ, topK),
      fusion: vectorSearch(index.map((s) => ({ id: s.id, embedding: s.fusion })), imageQ, topK),
    },
    models: {
      text: embeddingConfig,
      vision: visionConfig,
      fusion: "l2-average of Chinese-CLIP caption text and image vectors",
    },
  };
}

export async function searchImageBySku(
  querySkuId: string,
  topK = 5,
): Promise<SearchResult & { querySku: Sku }> {
  const catalog = loadCatalog();
  const querySku = catalog.skus.find((s) => s.id === querySkuId);
  if (!querySku) throw new Error(`unknown query sku ${querySkuId}`);
  const index = await buildIndex();
  const self = index.find((s) => s.id === querySkuId);
  if (!self) throw new Error(`query sku not in index ${querySkuId}`);
  const rest = index.filter((s) => s.id !== querySkuId);
  const [bgeQ] = await textEmbeddings([querySku.caption], true, true);
  const [clipTextQ] = await clipTextEmbeddings([querySku.caption]);
  return {
    querySku,
    lanes: {
      "text-bge": vectorSearch(rest.map((s) => ({ id: s.id, embedding: s.bge })), bgeQ, topK),
      "text-clip": vectorSearch(rest.map((s) => ({ id: s.id, embedding: s.clipText })), clipTextQ, topK),
      vision: vectorSearch(rest.map((s) => ({ id: s.id, embedding: s.clipImage })), self.clipImage, topK),
      fusion: vectorSearch(rest.map((s) => ({ id: s.id, embedding: s.fusion })), self.clipImage, topK),
    },
    models: {
      text: embeddingConfig,
      vision: visionConfig,
      fusion: "l2-average of Chinese-CLIP caption text and image vectors",
    },
  };
}

export { glazeById, loadCatalog, loadQuerySet };
