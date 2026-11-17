import chunks from "../data/chunks.json";
import queryData from "../data/queries.json";
import { buildIndex, search } from "../lib/bm25";
import { bigramTokenize, segmenterTokenize } from "../lib/tokenize";
import { embeddings, inferEmbeddings, embeddingConfig } from "../lib/embed";
import { vectorSearch } from "../lib/vector";
import { rrf, relativeScoreFusion, type Hit } from "../lib/fusion";
import { recallAtK, mrrAtK, ndcgAtK } from "../lib/metrics";
import { retrieve, rerankHits } from "../lib/pipeline";
import {
  createCrossEncoderScorer,
  createRerankAdapter,
  rerankConfig,
} from "../lib/rerank-adapter";
import { cacheDir, sessionOptions } from "../lib/model-env";
import os from "node:os";
import { createHash } from "node:crypto";
import { writeFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const start = performance.now();
const queries = queryData.queries;
const fingerprint = createHash("sha256")
  .update(
    JSON.stringify({
      chunks,
      queryData,
      embeddingConfig,
      rerankConfig,
      sessionOptions,
      protocol: "raw-rrf30-full30-v2",
    }),
  )
  .digest("hex");
let priorDuration = 0;
const machine = {
  cpu: os.cpus()[0].model,
  cores: os.cpus().length,
  memoryGB: os.totalmem() / 1024 ** 3,
  node: process.version,
  platform: os.platform(),
  onnxThreads: sessionOptions,
};
const rows: Record<string, Record<string, Hit[]>> = {};
const latency: { round: number; queryId: string; ms: number }[] = [];
const save = async (stage: string) =>
  writeFile(
    "eval-checkpoint.json",
    JSON.stringify(
      {
        stage,
        fingerprint,
        elapsedSeconds: priorDuration + (performance.now() - start) / 1000,
        timestamp: new Date().toISOString(),
        rows,
        latency,
      },
      null,
      2,
    ),
  );
const maxDiff = (a: number[][], b: number[][]) =>
  Math.max(0, ...a.flatMap((v, i) => v.map((x, j) => Math.abs(x - b[i][j]))));
function summary(relevants: Record<string, string[]> = {}) {
  const out: Record<
    string,
    Record<string, { n: number; recall5: number; mrr10: number; ndcg5: number }>
  > = {};
  for (const method of Object.keys(rows[queries[0].id] ?? {})) {
    out[method] = {};
    for (const type of ["all", ...new Set(queries.map((q) => q.type))]) {
      const qs = queries.filter((q) => type === "all" || q.type === type);
      out[method][type] = { n: qs.length, recall5: 0, mrr10: 0, ndcg5: 0 };
      for (const q of qs) {
        const ids = rows[q.id][method].map((h) => h.id),
          rel = relevants[q.id] ?? q.relevant;
        out[method][type].recall5 += recallAtK(ids, rel, 5) / qs.length;
        out[method][type].mrr10 += mrrAtK(ids, rel, 10) / qs.length;
        out[method][type].ndcg5 += ndcgAtK(ids, rel, 5) / qs.length;
      }
    }
  }
  return out;
}
const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: s[Math.ceil(0.5 * s.length) - 1],
    p95: s[Math.ceil(0.95 * s.length) - 1],
    mean: s.reduce((a, b) => a + b, 0) / s.length,
  };
};
async function main() {
  if (process.env.EVAL_RESUME === "1") {
    try {
      const previous = JSON.parse(
        await readFile("eval-checkpoint.json", "utf8"),
      );
      if (previous.fingerprint !== fingerprint)
        throw Error("checkpoint fingerprint mismatch");
      Object.assign(rows, previous.rows);
      latency.push(...previous.latency);
      priorDuration = previous.elapsedSeconds ?? 0;
      console.log(`恢复 checkpoint: ${latency.length} 条延迟记录`);
    } catch (error) {
      throw Error(`不能恢复 checkpoint: ${String(error)}`);
    }
  }
  console.log("模型缓存", cacheDir);
  console.log("开始真实嵌入");
  const raw = await embeddings(chunks.map((c) => c.text)),
    ctx = await embeddings(chunks.map((c) => c.contextualText)),
    qv = await embeddings(
      queries.map((q) => q.query),
      true,
    ),
    noPrefix = await embeddings(
      queries.map((q) => q.query),
      true,
      false,
    );
  const idx = buildIndex(chunks, bigramTokenize),
    ctxIdx = buildIndex(
      chunks.map((c) => ({ id: c.id, text: c.contextualText })),
      bigramTokenize,
    ),
    segIdx = buildIndex(chunks, segmenterTokenize);
  const vectors = chunks.map((c, i) => ({ id: c.id, embedding: raw[i] })),
    contextVectors = chunks.map((c, i) => ({ id: c.id, embedding: ctx[i] }));
  for (const [i, q] of queries.entries()) {
    const r = retrieve(q.query, qv[i], idx, vectors),
      c = retrieve(q.query, qv[i], ctxIdx, contextVectors);
    const methods: Record<string, Hit[]> = {
      bm25: r.bm25,
      vector: r.vector,
      "rrf-60": r.rrf,
      "context-bm25": c.bm25,
      "context-vector": c.vector,
      "context-rrf": c.rrf,
      segmenter: search(segIdx, q.query, 30),
      "vector-no-prefix": vectorSearch(vectors, noPrefix[i], 30),
    };
    for (const k of [1, 10, 60, 100])
      methods[`rrf-${k}`] = rrf([r.bm25, r.vector], k);
    for (const alpha of [0, 0.25, 0.5, 0.75, 1])
      methods[`rsf-${alpha}`] = relativeScoreFusion(r.bm25, r.vector, alpha);
    rows[q.id] = { ...rows[q.id], ...methods };
    console.log(`检索 ${i + 1}/${queries.length} ${q.id}`);
  }
  await save("retrieved");
  console.log("加载真实 cross-encoder");
  const score = await createCrossEncoderScorer(),
    model = createRerankAdapter(score);
  console.log("warmup 一轮全部查询");
  for (const [i, q] of queries.entries()) {
    await rerankHits(q.query, rows[q.id]["rrf-60"], model, false, 30);
    console.log(`warmup ${i + 1}/${queries.length}`);
  }
  for (let round = 1; round <= 3; round++) {
    for (const [i, q] of queries.entries()) {
      if (latency.some((x) => x.round === round && x.queryId === q.id)) {
        console.log(`恢复跳过 round ${round} ${q.id}`);
        continue;
      }
      const t = performance.now();
      const hit = await rerankHits(
        q.query,
        rows[q.id]["rrf-60"],
        model,
        false,
        30,
      );
      latency.push({ round, queryId: q.id, ms: performance.now() - t });
      rows[q.id].rerank = hit;
      await save(`latency-round-${round}`);
      console.log(
        `round ${round}/3 query ${i + 1}/${queries.length} ${q.id}: ${latency.at(-1)!.ms.toFixed(1)} ms`,
      );
    }
  }
  const input = embeddingConfig.prefix + queries[0].query;
  const e1 = await inferEmbeddings([input]),
    e2 = await inferEmbeddings([input]);
  const docs = chunks.slice(0, 4).map((c) => c.text),
    s1 = await score(queries[0].query, docs),
    s2 = await score(queries[0].query, docs);
  const determinism = {
    embeddingMaxAbsDiff: maxDiff(e1, e2),
    scoreMaxAbsDiff: maxDiff([s1], [s2]),
  };
  const metrics = summary();
  let corrections: Record<string, string[]> | undefined;
  try {
    corrections = JSON.parse(
      await readFile("data/label-corrections.json", "utf8"),
    );
  } catch {}
  const cacheSize = execFileSync("du", ["-sk", cacheDir], {
    encoding: "utf8",
  }).trim();
  console.log("du -sk", cacheSize);
  const perQuery = queries.map((q) => ({
    ...q,
    methods: Object.fromEntries(
      Object.entries(rows[q.id]).map(([method, list]) => [
        method,
        {
          ranking: list,
          top5: list
            .slice(0, 5)
            .map((h) => ({ ...h, relevant: q.relevant.includes(h.id) })),
          firstRelevantRank:
            list.findIndex((h) => q.relevant.includes(h.id)) + 1 || null,
        },
      ]),
    ),
  }));
  const result = {
    protocol: "raw-rrf30-full30-v2",
    timestamp: new Date().toISOString(),
    durationSeconds: priorDuration + (performance.now() - start) / 1000,
    fingerprint,
    embedding: embeddingConfig,
    reranker: rerankConfig,
    mirror: process.env.HF_ENDPOINT ?? null,
    machine,
    cache: { path: cacheDir, du: cacheSize },
    determinism,
    metrics,
    rerankDelta: Object.fromEntries(
      Object.keys(metrics.rerank).map((type) => [
        type,
        Object.fromEntries(
          ["recall5", "mrr10", "ndcg5"].map((k) => [
            k,
            metrics.rerank[type][k as "recall5"] -
              metrics["rrf-60"][type][k as "recall5"],
          ]),
        ),
      ]),
    ),
    latency: {
      raw: latency,
      rounds: [1, 2, 3].map((r) => ({
        round: r,
        ...stats(latency.filter((x) => x.round === r).map((x) => x.ms)),
      })),
      combined: stats(latency.map((x) => x.ms)),
    },
    tokenizationExamples: ["德化白瓷茶具 DH-TC-0915", "温水清洗，180ml"].map(
      (text) => ({
        text,
        bigram: bigramTokenize(text),
        segmenter: segmenterTokenize(text),
      }),
    ),
    perQuery,
    labelCorrections: corrections
      ? { corrections, metrics: summary(corrections) }
      : null,
  };
  await writeFile("results.json", JSON.stringify(result, null, 2));
  let md =
    `# 真实评测结果\n\n运行时间：${new Date(result.timestamp).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" })} Asia/Shanghai（UTC+8）。协议：${result.protocol}。\n\n` +
    "|方法|类型|n|recall@5|MRR@10|nDCG@5|\n|---|---|---:|---:|---:|---:|\n";
  for (const [method, groups] of Object.entries(metrics))
    for (const [type, m] of Object.entries(groups))
      md += `|${method}|${type}|${m.n}|${m.recall5.toFixed(6)}|${m.mrr10.toFixed(6)}|${m.ndcg5.toFixed(6)}|\n`;
  md +=
    "\n## 逐查询命中\n\n首个命中排名基于完整候选列表；重排保存全部30条。recall@5/nDCG@5使用前5，MRR@10使用前10。完整ranking见results.json。\n\n";
  const methods = Object.keys(rows[queries[0].id]);
  md +=
    "|id|类型|查询|relevant|" +
    methods.join("|") +
    "|\n|---|---|---|---|" +
    methods.map(() => "---").join("|") +
    "|\n";
  for (const q of perQuery)
    md +=
      `|${q.id}|${q.type}|${q.query}|${q.relevant.join(",")}|` +
      methods
        .map((m) => {
          const v = q.methods[m];
          return `${v.top5.some((h) => h.relevant) ? "✓" : "✗"} 首命中:${v.firstRelevantRank ?? "—"} ${v.top5.map((h) => h.id + (h.relevant ? "✓" : "✗")).join(",")}`;
        })
        .join("|") +
      "|\n";
  await writeFile("results.md", md);
  console.log(
    JSON.stringify(
      { metrics, latency: result.latency.combined, determinism },
      null,
      2,
    ),
  );
}
main().catch(async (error) => {
  console.error(error);
  await save("failed");
  await writeFile(
    "eval-error.json",
    JSON.stringify(
      {
        error: String(error),
        stack: error?.stack,
        timestamp: new Date().toISOString(),
        machine,
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
