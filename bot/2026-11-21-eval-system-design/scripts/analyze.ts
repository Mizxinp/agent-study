import { provenance, readVerifiedResults } from "../lib/frozen";
import {
  BOOTSTRAP_REPLICATES, BOOTSTRAP_SEED, JUDGE_STATUS, four, inspectRationales,
  intervals, pairedTests, pipelines, questionsFromRows, slices, summarize,
} from "../lib/statistics";

const frozen = readVerifiedResults();
const questions = questionsFromRows(frozen.rows);
const bySlice = slices.map(slice => {
  const group = questions.filter(question => slice === "all" || question.type === slice);
  return {
    slice,
    metrics: pipelines.map(pipeline => ({
      pipeline, ...summarize(group, pipeline), ...intervals(group, pipeline),
    })),
    ...pairedTests(group),
  };
});
const rationales = inspectRationales(frozen.rows);
readVerifiedResults();

const target = (slice: "multi" | "null", pipeline: "fixed" | "agentic") =>
  bySlice.find(result => result.slice === slice)!.metrics.find(metric => metric.pipeline === pipeline)!;
const h1 = [target("multi", "fixed"), target("null", "agentic")].every(
  metric => metric.byTrial.width < metric.byQuestion.width,
);
const h2 = bySlice.some(result => result.metrics.some(metric => metric.passAt3 > metric.passAll3));
const h4 = bySlice.every(result => result.byTrial.p < result.byQuestion.p);
type Interval = ReturnType<typeof intervals>["byTrial"];
const ci = ({ lower, upper, width }: Interval) => `[${four(lower)}, ${four(upper)}] 宽 ${four(width)}`;

console.log("分析前后核验通过，源文件和副本逐字节一致。", provenance);
console.log(`冻结数据 ${frozen.rows.length} 行，${questions.length} 题。`);
console.log(`H1 ${h1 ? "支持" : "不支持"}，Mulberry32 种子 ${BOOTSTRAP_SEED}，${BOOTSTRAP_REPLICATES} 次，95% 百分位 CI（线性插值）。`);
console.log(`H2 ${h2 ? "支持" : "不支持"}，比较单次、至少一次、三次全对。`);
for (const { slice, metrics } of bySlice) {
  for (const metric of metrics) {
    console.log(`${slice}/${metric.pipeline} 单次 ${four(metric.accuracy)} pass@3 ${four(metric.passAt3)} pass^3 ${four(metric.passAll3)} | 按 trial ${ci(metric.byTrial)} | 按题 ${ci(metric.byQuestion)}`);
  }
}

const count = (predicate: (hit: (typeof rationales.hits)[number]) => boolean) =>
  rationales.hits.filter(predicate).length;
console.log(`H3 不确定，检查 ${rationales.checked} 行，命中 ${rationales.hits.length} 行（非金标 SKU ${count(hit => hit.outsideGold.length > 0)}，空白 ${count(hit => hit.empty)}，明确否认匹配 ${count(hit => hit.contradiction)}）。`);
for (const exampleId of ["m01", "n01"]) {
  const hit = rationales.hits.find(hit => hit.qid === exampleId);
  if (hit) console.log(`${hit.qid} 第 ${hit.run} 轮，非金标 SKU ${hit.outsideGold.join("、")}：${hit.excerpt}`);
}
console.log(`LLM judge ${JUDGE_STATUS}（完全离线）`);

console.log(`H4 ${h4 ? "支持" : "不确定"}，独立单位按题，展开仅供复核 2.3。胜/负/平以 agentic 为基准。`);
for (const { slice, byQuestion, byTrial } of bySlice) {
  for (const [unit, test] of [["按题", byQuestion], ["按 trial 展开", byTrial]] as const) {
    const p = test.p < 0.001 ? test.p.toExponential(6) : four(test.p);
    console.log(`${slice} ${unit} n=${test.n} ${test.agenticWins}/${test.fixedWins}/${test.ties} p=${p}`);
  }
}
