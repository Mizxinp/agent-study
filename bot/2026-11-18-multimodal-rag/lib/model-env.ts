import { env } from "@huggingface/transformers";
import { existsSync, cpSync } from "node:fs";
import path from "node:path";

export const cacheDir = path.resolve(process.cwd(), ".model-cache");
export const sessionOptions = { intraOpNumThreads: 2, interOpNumThreads: 1 };

env.cacheDir = cacheDir;
if (process.env.HF_ENDPOINT)
  env.remoteHost = process.env.HF_ENDPOINT.replace(/\/$/, "") + "/";

// 本地复核必须复用已有缓存，缺失缓存直接报错，不下载。
if (process.env.MODELS_OFFLINE === "1") env.allowRemoteModels = false;

const BGE_REL = "Xenova/bge-small-zh-v1.5";

/** Reuse a local 2.1 BGE cache if present; never write back into that demo. */
export function maybeReuseLocalBgeCache(): string | undefined {
  const dest = path.join(cacheDir, BGE_REL);
  if (existsSync(path.join(dest, "config.json"))) return dest;
  const candidates = [
    process.env.BGE_CACHE_SRC,
    path.resolve(
      process.cwd(),
      "../2026-11-17-hybrid-retrieval-rerank/.model-cache/Xenova/bge-small-zh-v1.5",
    ),
    "/workspace/agent-study/bot/2026-11-17-hybrid-retrieval-rerank/.model-cache/Xenova/bge-small-zh-v1.5",
    "/workspace/accept/hybrid/bot/2026-11-17-hybrid-retrieval-rerank/.model-cache/Xenova/bge-small-zh-v1.5",
  ].filter((x): x is string => Boolean(x));
  for (const src of candidates) {
    if (existsSync(path.join(src, "config.json"))) {
      cpSync(src, dest, { recursive: true });
      return src;
    }
  }
  return undefined;
}
