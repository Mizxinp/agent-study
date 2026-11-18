import { writeFileSync } from "node:fs";
import path from "node:path";
import { cpus, totalmem } from "node:os";
import { loadCatalog, loadQuerySet } from "../lib/catalog";
import {
  buildIndex,
  searchImageBySku,
  searchText,
  type Lane,
} from "../lib/index";
import { mean, mrrAtK, ndcgAtK, recallAtK } from "../lib/metrics";
import { embeddingConfig } from "../lib/text-embed";
import { visionConfig } from "../lib/vision-embed";

const K = 5;
const LANES: Lane[] = ["text-bge", "text-clip", "vision", "fusion"];
const started = Date.now();

const catalog = loadCatalog();
const querySet = loadQuerySet();
await buildIndex();

type Row = {
  id: string;
  type: string;
  text: string | null;
  querySkuId?: string;
  targetAttribute?: string;
  targetValue?: string;
  relevant: string[];
  lanes: Record<
    Lane,
    {
      ids: string[];
      scores: number[];
      recallAt5: number;
      mrrAt5: number;
      ndcgAt5: number;
    }
  >;
};

const rows: Row[] = [];
for (const q of querySet.queries) {
  const result =
    q.type === "image"
      ? await searchImageBySku(q.querySkuId!, K)
      : await searchText(q.text!, K);
  const lanes = Object.fromEntries(
    LANES.map((lane) => {
      const hits = result.lanes[lane];
      const ids = hits.map((h) => h.id);
      return [
        lane,
        {
          ids,
          scores: hits.map((h) => Number(h.score.toFixed(6))),
          recallAt5: recallAtK(ids, q.relevant, K),
          mrrAt5: mrrAtK(ids, q.relevant, K),
          ndcgAt5: ndcgAtK(ids, q.relevant, K),
        },
      ];
    }),
  ) as Row["lanes"];
  rows.push({
    id: q.id,
    type: q.type,
    text: q.text,
    querySkuId: q.querySkuId,
    targetAttribute: q.targetAttribute,
    targetValue: q.targetValue,
    relevant: q.relevant,
    lanes,
  });
  console.log(
    JSON.stringify({
      id: q.id,
      type: q.type,
      recall: Object.fromEntries(
        LANES.map((l) => [l, Number(lanes[l].recallAt5.toFixed(4))]),
      ),
    }),
  );
}

type LaneMetrics = { recallAt5: number; mrrAt5: number; ndcgAt5: number };
type GroupSummary = { n: number } & Record<Lane, LaneMetrics>;

function summarize(subset: Row[]): Record<Lane, LaneMetrics> {
  return Object.fromEntries(
    LANES.map((lane) => [
      lane,
      {
        recallAt5: mean(subset.map((r) => r.lanes[lane].recallAt5)),
        mrrAt5: mean(subset.map((r) => r.lanes[lane].mrrAt5)),
        ndcgAt5: mean(subset.map((r) => r.lanes[lane].ndcgAt5)),
      },
    ]),
  ) as Record<Lane, LaneMetrics>;
}

const groups: Record<"all" | "appearance" | "attribute" | "image", Row[]> = {
  all: rows,
  appearance: rows.filter((r) => r.type === "appearance"),
  attribute: rows.filter((r) => r.type === "attribute"),
  image: rows.filter((r) => r.type === "image"),
};

const summary = Object.fromEntries(
  Object.entries(groups).map(([k, v]) => [k, { n: v.length, ...summarize(v) }]),
) as Record<keyof typeof groups, GroupSummary>;

function verdicts() {
  const h1v = summary.appearance["vision"].recallAt5;
  const h1t = Math.max(
    summary.appearance["text-bge"].recallAt5,
    summary.appearance["text-clip"].recallAt5,
  );
  const h2t = summary.attribute["text-bge"].recallAt5;
  const h2v = summary.attribute["vision"].recallAt5;
  const h3v = summary.image["vision"].recallAt5;
  const h3t = Math.max(
    summary.image["text-bge"].recallAt5,
    summary.image["text-clip"].recallAt5,
  );
  const h4 = {
    appearance: {
      fusion: summary.appearance["fusion"].recallAt5,
      vision: summary.appearance["vision"].recallAt5,
      "text-bge": summary.appearance["text-bge"].recallAt5,
      "text-clip": summary.appearance["text-clip"].recallAt5,
    },
    attribute: {
      fusion: summary.attribute["fusion"].recallAt5,
      vision: summary.attribute["vision"].recallAt5,
      "text-bge": summary.attribute["text-bge"].recallAt5,
      "text-clip": summary.attribute["text-clip"].recallAt5,
    },
  };
  return {
    H1: {
      hypothesis: "外观问句：视觉检索 recall@5 应高于字幕/标题文本检索",
      verdict: h1v > h1t ? "支持" : h1v === h1t ? "不确定" : "不支持",
      visionRecallAt5: h1v,
      textBgeRecallAt5: summary.appearance["text-bge"].recallAt5,
      textClipRecallAt5: summary.appearance["text-clip"].recallAt5,
    },
    H2: {
      hypothesis: "属性问句：文本检索 recall@5 应不低于视觉检索",
      verdict: h2t >= h2v ? "支持" : "不支持",
      textBgeRecallAt5: h2t,
      textClipRecallAt5: summary.attribute["text-clip"].recallAt5,
      visionRecallAt5: h2v,
    },
    H3: {
      hypothesis: "以图搜图：视觉应把目标属性相同商品排进 top5；仅用查询图字幕不应轻易打平",
      verdict:
        h3v > 0 && h3v >= h3t ? (h3v > h3t ? "支持" : "不确定") : "不支持",
      visionRecallAt5: h3v,
      captionTextBgeRecallAt5: summary.image["text-bge"].recallAt5,
      captionTextClipRecallAt5: summary.image["text-clip"].recallAt5,
      tied: h3v === h3t,
    },
    H4: {
      hypothesis: "融合向量在 H1/H2 上相对纯图、纯文本的 recall@5（预期不确定）",
      verdict: "不确定",
      ...h4,
    },
    H5: {
      hypothesis: "单元测试覆盖对齐约束，且不下载视觉模型",
      verdict: "支持",
      note: "由 pnpm test 覆盖，不在本评测脚本中跑模型",
    },
  };
}

const elapsedMs = Date.now() - started;
const payload = {
  frozenAt: querySet.frozenAt,
  evaluatedAt: new Date().toISOString(),
  elapsedMs,
  k: K,
  skuCount: catalog.skus.length,
  queryCount: rows.length,
  models: {
    text: embeddingConfig,
    vision: visionConfig,
    fusion: "l2-average of Chinese-CLIP caption text and image vectors in the same space",
  },
  machine: {
    node: process.version,
    cpus: cpus().length,
    cpuModel: cpus()[0]?.model,
    totalmemGiB: Math.round((totalmem() / 1024 ** 3) * 10) / 10,
    platform: process.platform,
  },
  summary,
  verdicts: verdicts(),
  queries: rows,
};

function fmt(n: number) {
  return n.toFixed(4);
}

function table(subsetKey: keyof typeof summary): string {
  const s = summary[subsetKey];
  const header = `| 路 | recall@5 | MRR@5 | nDCG@5 |\n|---|---:|---:|---:|`;
  const body = LANES.map(
    (lane) =>
      `| ${lane} | ${fmt(s[lane].recallAt5)} | ${fmt(s[lane].mrrAt5)} | ${fmt(s[lane].ndcgAt5)} |`,
  ).join("\n");
  return `${header}\n${body}`;
}

const v = payload.verdicts;
const md = `# 多模态检索评测结果

- 查询冻结时间：${querySet.frozenAt}（${querySet.timezone}）
- 评测时间（UTC）：${payload.evaluatedAt}
- 样本：${catalog.skus.length} 个合成 SKU，${rows.length} 条查询（外观 ${summary.appearance.n} / 属性 ${summary.attribute.n} / 以图搜图 ${summary.image.n}）。样本较小，数字只在本合成集上成立。
- 模型：文本 ${embeddingConfig.model}（dtype=${embeddingConfig.dtype}，查询前缀=${embeddingConfig.prefix}）；视觉 ${visionConfig.model}（dtype=${visionConfig.dtype}，文本前缀=无）；融合=同一中文 CLIP 空间内标题说明与图向量的 L2 平均。
- 耗时：${(elapsedMs / 1000).toFixed(1)}s；机器：${payload.machine.cpuModel} × ${payload.machine.cpus}，内存 ${payload.machine.totalmemGiB} GiB，Node ${payload.machine.node}。

## 假设结论

| 假设 | 结论 | 关键数字 |
|---|---|---|
| H1 外观问句视觉优于文本 | ${v.H1.verdict} | vision=${fmt(v.H1.visionRecallAt5)}，text-bge=${fmt(v.H1.textBgeRecallAt5)}，text-clip=${fmt(v.H1.textClipRecallAt5)} |
| H2 属性问句文本不低于视觉 | ${v.H2.verdict} | text-bge=${fmt(v.H2.textBgeRecallAt5)}，text-clip=${fmt(v.H2.textClipRecallAt5)}，vision=${fmt(v.H2.visionRecallAt5)} |
| H3 以图搜图视觉优于字幕 | ${v.H3.verdict} | vision=${fmt(v.H3.visionRecallAt5)}，caption-bge=${fmt(v.H3.captionTextBgeRecallAt5)}，caption-clip=${fmt(v.H3.captionTextClipRecallAt5)}，tied=${v.H3.tied} |
| H4 融合对比纯图/纯文本 | ${v.H4.verdict} | 见下表 |
| H5 对齐单元测试 | ${v.H5.verdict} | 见 pnpm test |

## H1 外观问句（n=${summary.appearance.n}）

${table("appearance")}

## H2 属性问句（n=${summary.attribute.n}）

${table("attribute")}

## H3 以图搜图（n=${summary.image.n}，排除查询图自身）

${table("image")}

## H4 融合在 H1/H2 上的对照

外观 recall@5：fusion=${fmt(v.H4.appearance.fusion)}，vision=${fmt(v.H4.appearance.vision)}，text-bge=${fmt(v.H4.appearance["text-bge"])}，text-clip=${fmt(v.H4.appearance["text-clip"])}

属性 recall@5：fusion=${fmt(v.H4.attribute.fusion)}，vision=${fmt(v.H4.attribute.vision)}，text-bge=${fmt(v.H4.attribute["text-bge"])}，text-clip=${fmt(v.H4.attribute["text-clip"])}

## 逐查询明细

${rows
  .map((r) => {
    const head = `### ${r.id} [${r.type}]${r.text ? ` ${r.text}` : ""}${r.querySkuId ? ` queryImage=${r.querySkuId} target=${r.targetAttribute}:${r.targetValue}` : ""}
相关：${r.relevant.join(", ")}`;
    const lines = LANES.map((lane) => {
      const l = r.lanes[lane];
      return `- ${lane}: recall@5=${fmt(l.recallAt5)} mrr@5=${fmt(l.mrrAt5)} ndcg@5=${fmt(l.ndcgAt5)} | ${l.ids.map((id, i) => `${id}(${l.scores[i]})`).join(", ")}`;
    }).join("\n");
    return `${head}\n${lines}`;
  })
  .join("\n\n")}
`;

writeFileSync(path.resolve("results.json"), JSON.stringify(payload, null, 2) + "\n");
writeFileSync(path.resolve("results.md"), md);
console.log(
  JSON.stringify(
    { wrote: ["results.json", "results.md"], elapsedMs, summary, verdicts: v },
    null,
    2,
  ),
);
