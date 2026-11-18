/**
 * 真实 LLM 评测：fixed vs agentic，H1–H3。
 * 需要 CR 兼容密钥（ANTHROPIC_API_KEY + ANTHROPIC_BASE_URL，或 LLM_PROVIDER=openai 时 OPENAI_*）。
 * 没有密钥时打印 SKIPPED 并以退出码 2 结束，不写 results.*，绝不 mock。
 * 环境变量：RUNS（默认 3）、CONCURRENCY（默认 2）、LLM_MODEL（默认 claude-haiku-5-5）、EVAL_LIMIT（调试用，只跑前 N 题）。
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { questions, questionsFinalizedAt, type Question, type QuestionType } from "../lib/data";
import { exactMatch, mean, percentile, setF1, signTestP } from "../lib/metrics";
import { AGENTIC_MAX_STEPS, AGENTIC_SEARCH_TOP_K, FIXED_TOP_K, runAgentic, runFixed, type RunResult } from "../lib/pipelines";
import { createLlm, resolveLlmConfig } from "../lib/providers";
import { retrievalConfig } from "../lib/retrieval";
import { netLatency, requestLog, timingFetch, type RequestRecord } from "../lib/request-timing";
import { embeddingConfig } from "../lib/embed";

const cfg = resolveLlmConfig();
if (!cfg.ok) {
  console.log(`SKIPPED: 真实 LLM 评测未运行（${cfg.reason}）。H1–H3 标记 SKIPPED；H4–H8 见 pnpm test。`);
  process.exit(2);
}
const RUNS = Number(process.env.RUNS ?? 3);
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 1);
const JOB_ATTEMPTS = Number(process.env.JOB_ATTEMPTS ?? 4);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let errorAttempts = 0;
const LIMIT = process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : undefined;
const CHECKPOINT = "eval-checkpoint.jsonl";
const { model, modelId, provider, baseHost } = createLlm(process.env, timingFetch);
const qs: Question[] = LIMIT ? questions.slice(0, LIMIT) : questions;
const pipelines = ["fixed", "agentic"] as const;

type Row = RunResult & { qid: string; type: QuestionType; run: number; gold: string[]; correct: boolean; f1: number; error?: string; netLatencyMs: number; httpRequests: number; failedRequests: number; retryOverheadMs: number };

const done = new Map<string, Row>();
if (existsSync(CHECKPOINT) && process.env.EVAL_RESUME !== "0") {
  for (const line of readFileSync(CHECKPOINT, "utf8").split("\n").filter(Boolean)) {
    const r = JSON.parse(line) as Row & { modelId?: string };
    // 出错的行（如 429 重试耗尽）不算完成，续跑时重新排队。
    if (r.modelId === modelId && !r.error) done.set(`${r.qid}|${r.pipeline}|${r.run}`, r);
  }
}
const jobs: { q: Question; pipeline: (typeof pipelines)[number]; run: number }[] = [];
for (let run = 1; run <= RUNS; run++)
  for (const q of qs) for (const pipeline of pipelines) if (!done.has(`${q.id}|${pipeline}|${run}`)) jobs.push({ q, pipeline, run });

const started = new Date();
console.log(`eval start ${started.toISOString()} model=${modelId} provider=${provider} host=${baseHost} runs=${RUNS} questions=${qs.length} jobs=${jobs.length} (resumed ${done.size}) concurrency=${CONCURRENCY}`);
let finished = 0;
async function worker() {
  for (;;) {
    const job = jobs.shift();
    if (!job) return;
    const { q, pipeline, run } = job;
    let r: RunResult | undefined;
    let error: string | undefined;
    let timing = { netMs: 0, failedRequests: 0, retryOverheadMs: 0, httpRequests: 0 };
    for (let attempt = 1; attempt <= JOB_ATTEMPTS; attempt++) {
      try {
        const recs: RequestRecord[] = [];
        r = await requestLog.run(recs, () => (pipeline === "fixed" ? runFixed : runAgentic)(model, q.question));
        timing = { ...netLatency(r.latencyMs, recs), httpRequests: recs.length };
        error = undefined;
        break;
      } catch (e) {
        error = String(e).slice(0, 500);
        errorAttempts++;
        console.log(`  retry ${q.id} ${pipeline} run${run} attempt ${attempt}/${JOB_ATTEMPTS}: ${error.slice(0, 120)}`);
        // 整题重跑前退避（SDK 自身已按 maxRetries 做指数退避）。
        if (attempt < JOB_ATTEMPTS) await sleep(30_000 * attempt);
      }
    }
    if (!r) r = { pipeline, answer: null, rationale: "", steps: [], inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: 0, finishReason: "error", warnings: [] };
    const row: Row = { ...r, qid: q.id, type: q.type, run, gold: q.gold, correct: exactMatch(r.answer, q.gold), f1: setF1(r.answer, q.gold), netLatencyMs: timing.netMs, httpRequests: timing.httpRequests, failedRequests: timing.failedRequests, retryOverheadMs: timing.retryOverheadMs, ...(error ? { error } : {}) };
    done.set(`${q.id}|${pipeline}|${run}`, row);
    appendFileSync(CHECKPOINT, JSON.stringify({ ...row, modelId }) + "\n");
    finished++;
    console.log(`[${finished}] run${run} ${q.id} ${pipeline} ${row.correct ? "OK" : "XX"} pred=${JSON.stringify(r.answer)} ${r.latencyMs}ms(net ${timing.netMs}ms, ${timing.failedRequests} failed req) ${r.totalTokens}tok ${r.steps.length}steps${error ? " ERROR " + error.slice(0, 120) : ""}`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const rows = [...done.values()].filter((r) => qs.some((q) => q.id === r.qid) && r.run <= RUNS);
const types: QuestionType[] = ["single", "multi", "null"];
const typeName = { single: "单跳", multi: "多跳/比较", null: "Null" } as const;
const r4 = (x: number) => Math.round(x * 10000) / 10000;
function agg(sel: Row[]) {
  const ok = sel.filter((r) => !r.error);
  return {
    n: sel.length,
    errors: sel.length - ok.length,
    accuracy: r4(mean(sel.map((r) => (r.correct ? 1 : 0)))),
    meanF1: r4(mean(sel.map((r) => r.f1))),
    refusalRate: r4(mean(sel.map((r) => (r.answer != null && r.answer.length === 0 ? 1 : 0)))),
    noAnswerRate: r4(mean(sel.map((r) => (r.answer == null ? 1 : 0)))),
    meanInputTokens: r4(mean(ok.map((r) => r.inputTokens))),
    meanOutputTokens: r4(mean(ok.map((r) => r.outputTokens))),
    meanTotalTokens: r4(mean(ok.map((r) => r.totalTokens))),
    latencyP50Ms: Math.round(percentile(ok.map((r) => r.latencyMs), 0.5)),
    latencyP95Ms: Math.round(percentile(ok.map((r) => r.latencyMs), 0.95)),
    meanLatencyMs: Math.round(mean(ok.map((r) => r.latencyMs))),
    netLatencyP50Ms: Math.round(percentile(ok.map((r) => r.netLatencyMs), 0.5)),
    netLatencyP95Ms: Math.round(percentile(ok.map((r) => r.netLatencyMs), 0.95)),
    meanNetLatencyMs: Math.round(mean(ok.map((r) => r.netLatencyMs))),
    failedRequests: ok.reduce((a, r) => a + r.failedRequests, 0),
    meanSteps: r4(mean(ok.map((r) => r.steps.length))),
    perRunAccuracy: Array.from({ length: RUNS }, (_, i) => r4(mean(sel.filter((r) => r.run === i + 1).map((r) => (r.correct ? 1 : 0))))),
  };
}
const summary: Record<string, Record<string, ReturnType<typeof agg>>> = {};
const paired: Record<string, { agenticWins: number; fixedWins: number; ties: number; signTestP: number }> = {};
for (const t of [...types, "all"] as const) {
  summary[t] = {};
  for (const p of pipelines) summary[t][p] = agg(rows.filter((r) => r.pipeline === p && (t === "all" || r.type === t)));
  let aw = 0, fw = 0, ties = 0;
  for (const q of qs.filter((q) => t === "all" || q.type === t))
    for (let run = 1; run <= RUNS; run++) {
      const a = done.get(`${q.id}|agentic|${run}`)?.correct, f = done.get(`${q.id}|fixed|${run}`)?.correct;
      if (a === undefined || f === undefined) continue;
      if (a && !f) aw++; else if (f && !a) fw++; else ties++;
    }
  paired[t] = { agenticWins: aw, fixedWins: fw, ties, signTestP: r4(signTestP(aw, fw)) };
}
const toolUsage: Record<string, number> = {};
let firstStepNonSearch = 0, firstStepParallel = 0;
for (const r of rows.filter((r) => r.pipeline === "agentic" && !r.error)) {
  for (const s of r.steps) for (const c of s.toolCalls) toolUsage[c.toolName] = (toolUsage[c.toolName] ?? 0) + 1;
  const s0 = r.steps[0];
  if (s0 && s0.toolCalls.some((c) => c.toolName !== "search")) firstStepNonSearch++;
  if (s0 && s0.toolCalls.length > 1) firstStepParallel++;
}
const ended = new Date();
const meta = {
  startedAt: started.toISOString(),
  endedAt: ended.toISOString(),
  durationSec: Math.round((ended.getTime() - started.getTime()) / 1000),
  provider,
  modelId,
  baseHost,
  temperature: "未设置（使用模型端默认值；claude-haiku-5-5 / claude-sonnet-5-5 会忽略 temperature）",
  runs: RUNS,
  concurrency: CONCURRENCY,
  llmMaxRetries: Number(process.env.LLM_MAX_RETRIES ?? 6),
  jobAttempts: JOB_ATTEMPTS,
  failedAttemptsRetried: errorAttempts,
  note: "墙钟延迟=单题端到端（含本地检索、SDK 内部 429 退避重试）；净延迟=墙钟扣除失败/429 请求及其后退避等待（见 lib/request-timing.ts netLatency）。整题重跑前的失败尝试不计入延迟和 token。",
  questions: qs.length,
  questionsFinalizedAt,
  fixed: { topK: FIXED_TOP_K, generations: 1, toolChoice: "answer（强制，结构化输出）" },
  agentic: { searchTopK: AGENTIC_SEARCH_TOP_K, stopWhen: `[isStepCount(${AGENTIC_MAX_STEPS}), hasToolCall('answer')]`, firstStepToolChoice: "search" },
  retrieval: { ...retrievalConfig, embeddingModel: embeddingConfig.model, dtype: embeddingConfig.dtype },
  machine: { cpus: os.cpus().length, cpuModel: os.cpus()[0]?.model, memGiB: Math.round((os.totalmem() / 2 ** 30) * 10) / 10, node: process.version, platform: `${os.type()} ${os.release()}` },
  agenticToolUsage: toolUsage,
  agenticFirstStepWithNonSearchCall: firstStepNonSearch,
  agenticFirstStepParallelCalls: firstStepParallel,
};
const sortedRows = rows.sort((a, b) => a.qid.localeCompare(b.qid) || a.run - b.run || a.pipeline.localeCompare(b.pipeline));
writeFileSync("results.json", JSON.stringify({ meta, summary, paired, rows: sortedRows }, null, 2) + "\n");

const md: string[] = [];
md.push(`# Agentic RAG 循环 vs 固定单次 RAG：评测结果`, "", `- 模型：${provider} / ${modelId}（host ${baseHost}），temperature 未设置，重复 ${RUNS} 次，并发 ${CONCURRENCY}`, `- 问题集：${qs.length} 条，冻结于 ${questionsFinalizedAt}`, `- 开始 ${meta.startedAt}，结束 ${meta.endedAt}，耗时 ${meta.durationSec}s`, "");
md.push(`## 汇总`, "", `| 题型 | 路线 | n | 精确匹配准确率 | 平均 F1 | 拒答率(答空集) | 未作答率 | 平均 token(入/出/总) | 净延迟 p50/p95 ms | 墙钟延迟 p50/p95 ms | 平均步数 | 每轮准确率 | 错误 |`, `|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
for (const t of [...types, "all"] as const)
  for (const p of pipelines) {
    const s = summary[t][p];
    md.push(`| ${t === "all" ? "全部" : typeName[t]} | ${p} | ${s.n} | ${s.accuracy} | ${s.meanF1} | ${s.refusalRate} | ${s.noAnswerRate} | ${s.meanInputTokens}/${s.meanOutputTokens}/${s.meanTotalTokens} | ${s.netLatencyP50Ms}/${s.netLatencyP95Ms} | ${s.latencyP50Ms}/${s.latencyP95Ms} | ${s.meanSteps} | ${s.perRunAccuracy.join(" / ")} | ${s.errors} |`);
  }
md.push("", `## 配对比较（同题同轮，agentic 对 fixed）`, "", `| 题型 | agentic 赢 | fixed 赢 | 平 | 符号检验 p（双侧） |`, `|---|---|---|---|---|`);
for (const t of [...types, "all"] as const) md.push(`| ${t === "all" ? "全部" : typeName[t]} | ${paired[t].agenticWins} | ${paired[t].fixedWins} | ${paired[t].ties} | ${paired[t].signTestP} |`);
md.push("", `agentic 工具调用次数：${JSON.stringify(toolUsage)}；第 1 步除 search 外还并行调用了其他工具的次数：${firstStepNonSearch}；第 1 步多工具并行次数：${firstStepParallel}`, "");
md.push(`## 逐题明细`, "", `| 题 | 类型 | 轮 | 路线 | 标准答案 | 预测 | 对 | F1 | token | 净延迟 ms | 墙钟 ms | 失败请求 | 步数 | 工具轨迹 |`, `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
const fmt = (x: string[] | null) => (x == null ? "（未作答）" : x.length ? x.join(",") : "无");
for (const r of sortedRows) {
  const trace = r.error ? `ERROR ${r.error.slice(0, 80).replace(/\|/g, "/")}` : r.steps.map((s) => s.toolCalls.map((c) => c.toolName).join("+") || "text").join(" → ");
  md.push(`| ${r.qid} | ${typeName[r.type]} | ${r.run} | ${r.pipeline} | ${fmt(r.gold)} | ${fmt(r.answer)} | ${r.correct ? "✓" : "✗"} | ${r4(r.f1)} | ${r.totalTokens} | ${r.netLatencyMs} | ${r.latencyMs} | ${r.failedRequests} | ${r.steps.length} | ${trace} |`);
}
writeFileSync("results.md", md.join("\n") + "\n");
console.log(JSON.stringify({ summary: Object.fromEntries(Object.entries(summary).map(([t, v]) => [t, Object.fromEntries(Object.entries(v).map(([p, s]) => [p, { acc: s.accuracy, f1: s.meanF1, refusal: s.refusalRate, tok: s.meanTotalTokens, p50: s.latencyP50Ms, p95: s.latencyP95Ms, netP50: s.netLatencyP50Ms, netP95: s.netLatencyP95Ms, steps: s.meanSteps, err: s.errors }]))])), paired }, null, 1));
console.log(`eval done ${ended.toISOString()} duration ${meta.durationSec}s`);
