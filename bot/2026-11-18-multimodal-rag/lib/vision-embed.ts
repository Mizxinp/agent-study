import {
  AutoModel,
  AutoProcessor,
  AutoTokenizer,
  RawImage,
} from "@huggingface/transformers";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { cacheDir, sessionOptions } from "./model-env";
import { l2normalize } from "./fusion";

export const visionConfig = {
  model: "Xenova/chinese-clip-vit-base-patch16",
  dtype: "q8",
  textPrefix: "", // Chinese-CLIP 文本塔不用 BGE 指令前缀
  imageSize: 224,
  preprocess: "AutoProcessor: resize/center-crop to 224, CLIP mean/std",
} as const;

type ClipModel = Awaited<ReturnType<typeof AutoModel.from_pretrained>>;
type ClipProcessor = Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
type ClipTokenizer = Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;

let modelPromise: Promise<{
  model: ClipModel;
  processor: ClipProcessor;
  tokenizer: ClipTokenizer;
}> | null = null;

async function loadClip() {
  modelPromise ??= (async () => {
    const [model, processor, tokenizer] = await Promise.all([
      AutoModel.from_pretrained(visionConfig.model, {
        dtype: visionConfig.dtype,
        session_options: sessionOptions,
      }),
      AutoProcessor.from_pretrained(visionConfig.model),
      AutoTokenizer.from_pretrained(visionConfig.model),
    ]);
    return { model, processor, tokenizer };
  })();
  return modelPromise;
}

function tensorToVectors(tensor: { tolist(): unknown }): number[][] {
  const list = tensor.tolist() as number[][] | number[][][];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("empty embedding tensor");
  }
  if (typeof list[0] === "number") return [l2normalize(list as unknown as number[])];
  if (Array.isArray(list[0]) && typeof list[0][0] === "number") {
    return (list as number[][]).map(l2normalize);
  }
  throw new Error("unexpected embedding tensor rank");
}

function extractEmbeds(
  output: Record<string, { tolist(): unknown }>,
  keys: string[],
): number[][] {
  for (const key of keys) {
    if (output[key]) return tensorToVectors(output[key]);
  }
  throw new Error(`missing embedding keys ${keys.join("/")} in ${Object.keys(output)}`);
}

async function cached(
  suffix: string,
  payload: unknown,
  compute: () => Promise<number[][]>,
): Promise<number[][]> {
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const file = `${cacheDir}/${suffix}-${hash}.json`;
  try {
    return JSON.parse(await readFile(file, "utf8")) as number[][];
  } catch {}
  await mkdir(cacheDir, { recursive: true });
  const result = await compute();
  await writeFile(file, JSON.stringify(result));
  return result;
}

export async function clipTextEmbeddings(texts: string[]): Promise<number[][]> {
  return cached(
    "clip-text",
    { config: visionConfig, texts },
    async () => {
      const { model, tokenizer } = await loadClip();
      const inputs = tokenizer(texts, { padding: true, truncation: true });
      const output = (await model(inputs)) as Record<string, { tolist(): unknown }>;
      return extractEmbeds(output, ["text_embeds", "text_embeddings"]);
    },
  );
}

export async function clipImageEmbeddings(paths: string[]): Promise<number[][]> {
  const stats = await Promise.all(
    paths.map(async (p) => {
      const buf = await readFile(p);
      const hash = createHash("sha256").update(buf).digest("hex");
      return { path: p, sha256: hash };
    }),
  );
  return cached(
    "clip-image",
    { config: visionConfig, images: stats },
    async () => {
      const { model, processor } = await loadClip();
      const vectors: number[][] = [];
      for (const p of paths) {
        const image = await RawImage.read(p);
        const processed = await processor(image);
        const output = (await model(processed)) as Record<
          string,
          { tolist(): unknown }
        >;
        const [vec] = extractEmbeds(output, ["image_embeds", "image_embeddings"]);
        vectors.push(vec);
      }
      return vectors;
    },
  );
}

export async function clipImageEmbeddingFromBuffer(
  buffer: Buffer,
  mime = "image/png",
): Promise<number[]> {
  const { model, processor } = await loadClip();
  // RawImage.read accepts paths; for buffers use RawImage.fromBlob / fromTensor if needed.
  const image = await RawImage.read(new Blob([new Uint8Array(buffer)], { type: mime }));
  const processed = await processor(image);
  const output = (await model(processed)) as Record<string, { tolist(): unknown }>;
  const [vec] = extractEmbeds(output, ["image_embeds", "image_embeddings"]);
  return vec;
}
