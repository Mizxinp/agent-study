import { env } from "@huggingface/transformers";
import path from "node:path";
export const cacheDir = path.resolve(process.cwd(), ".model-cache");
export const sessionOptions = { intraOpNumThreads: 2, interOpNumThreads: 1 };
env.cacheDir = cacheDir;
if (process.env.HF_ENDPOINT)
  env.remoteHost = process.env.HF_ENDPOINT.replace(/\/$/, "") + "/";

// 本地复核必须复用已有缓存，缺失缓存直接报错，不下载。
if (process.env.MODELS_OFFLINE === "1") env.allowRemoteModels = false;
