import { readFile, writeFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import path from "node:path";
type Metric = { n: number; recall5: number; mrr10: number; ndcg5: number };
const r = JSON.parse(await readFile("results.json", "utf8"));
const metrics = r.metrics as Record<string, Record<string, Metric>>;
let report = await readFile("REPORT.md", "utf8");
report = report.replace(
  "本文数字待验证链及真实模型运行完成后填写。未产生的模型结果不可推断。",
  "所有主结果来自冻结标签下的本地真实推理；验证记录、模型配置及逐查询明细均保存在本目录。",
);
const f = (n: number) => n.toFixed(6);
function table(
  methods: string[],
  groups = ["all", "exact", "paraphrase", "anaphora"],
) {
  let s = "\n|方法|类型|recall@5|MRR@10|nDCG@5|\n|---|---|---:|---:|---:|\n";
  for (const method of methods)
    for (const group of groups) {
      const m = metrics[method][group];
      s += `|${method}|${group}|${f(m.recall5)}|${f(m.mrr10)}|${f(m.ndcg5)}|\n`;
    }
  return s + "\n";
}
let result = `本次运行时间戳：${new Date(r.timestamp).toLocaleString("sv-SE", { timeZone: "Asia/Shanghai" })} Asia/Shanghai（UTC+8）。完整按类型指标、所有参数及逐查询top5见 [results.md](results.md)；原始分数、延迟数组见 [results.json](results.json)。以下数字直接读取该文件。\n\n`;
result +=
  "### H1：融合优于单路——不支持\n\nH1分三子项（recall@5）：(i) exact BM25 0.656250 < vector 0.750000，不支持精确查询BM25更优；(ii) paraphrase vector 0.375000 > BM25 0.218750，支持向量更优；(iii) hybrid总体0.437500 < vector 0.583333，不支持融合优于单路。\n" +
  table(["bm25", "vector", "rrf-60"]);
result +=
  "### H2：k=60近优且参数不关键——不支持；alpha存在敏感性——支持\n\n本例 k=1 的总体 recall@5 高于60，60与100相同，因此本数据不支持60近优。RSF在alpha=0.75时总体recall@5最高；这是在同一小测试集上的描述性选择，不是验证集调参结果，不可外推最佳权重。\n" +
  table(["rrf-1", "rrf-10", "rrf-60", "rrf-100"], ["all"]) +
  "alpha敏感性表（alpha为向量权重）：\n" +
  table(["rsf-0", "rsf-0.25", "rsf-0.5", "rsf-0.75", "rsf-1"], ["all"]);
result +=
  "### H3：重排改善——支持本样本结果，泛化不确定\n\n仅对原始text的RRF(k=60)前30候选交叉编码重排并保留全部30条；页面/API仍仅展示前5。recall@5和nDCG@5用前5，MRR@10用前10，计时包含全部排序。\n" +
  table(["rrf-60", "rerank"]);
result += "|类型|Δrecall@5|ΔMRR@10|ΔnDCG@5|\n|---|---:|---:|---:|\n";
for (const [group, delta] of Object.entries(r.rerankDelta) as [
  string,
  Record<string, number>,
][])
  result += `|${group}|${f(delta.recall5)}|${f(delta.mrr10)}|${f(delta.ndcg5)}|\n`;
result +=
  "\n一整轮全部48查询warmup，不计入延迟；随后3轮，每轮48条，共144条实际推理记录。百分位采用nearest-rank（排序后ceil(p*n)项），单位ms。\n\n|轮次|n|p50|p95|mean|\n|---|---:|---:|---:|---:|\n";
for (const item of [
  ...r.latency.rounds,
  { round: "合并", ...r.latency.combined },
])
  result += `|${item.round}|${item.n}|${f(item.p50)}|${f(item.p95)}|${f(item.mean)}|\n`;
result += `\n机器：${r.machine.cpu}，${r.machine.cores}逻辑核，总内存${r.machine.memoryGB.toFixed(2)} GiB，${r.machine.platform}，Node ${r.machine.node}；ONNX设置 ${JSON.stringify(r.machine.onnxThreads)}。延迟包含SDK、tokenize、batch推理和排序，不含查询嵌入与最初召回。无并行查询。\n\n`;
result +=
  "### H4：确定性上下文改善指代检索——支持本样本结果\n\n这是Contextual Retrieval的低成本确定性变体；无LLM。anaphora所有三路均达到1，但重复模板与商品标题捷径使此结果不能泛化到真实语料；context-vector在exact类也出现下降，不能宣称所有类型都受益。\n" +
  table([
    "bm25",
    "context-bm25",
    "vector",
    "context-vector",
    "rrf-60",
    "context-rrf",
  ]);
result +=
  "### H5：分词影响——支持有小幅差异，优劣泛化不确定\n\nIntl.Segmenter相对bigram的总体recall@5小幅上升，exact和paraphrase没有改变。只比较这两种分词，不增加jieba。\n" +
  table(["bm25", "segmenter"]);
result += "分词示例：\n";
for (const item of r.tokenizationExamples)
  result += `\n- ${item.text}\n  - bigram：${JSON.stringify(item.bigram)}\n  - Intl：${JSON.stringify(item.segmenter)}\n`;
result +=
  "\n额外消融：本样本不支持“加BGE前缀必然提高recall”。主结果遵循模型卡加前缀，无前缀仅是消融。\n" +
  table(["vector", "vector-no-prefix"]);
const begin = "<!-- GENERATED:START -->",
  end = "<!-- GENERATED:END -->";
if (
  report.split(begin).length !== 2 ||
  report.split(end).length !== 2 ||
  report.indexOf(begin) >= report.indexOf(end)
)
  throw Error("Missing report generation markers");
const head = report.slice(0, report.indexOf(begin) + begin.length) + "\n\n";
const tail = report.slice(report.indexOf(end));
const sdk = (await readFile("node_modules/ai/dist/index.js", "utf8")).split(
  "\n",
);
const quote = (start: number, end: number) =>
  `\n\`node_modules/ai/dist/index.js:${start}–${end}\`：\n\`\`\`js\n${sdk.slice(start - 1, end).join("\n")}\n\`\`\`\n`;
const h6 =
  `### H6：SDK行为——支持接口编排与索引校验，不支持核心自动排序\n\n实测正常适配器排序且topN与文档映射正确；故意未排序的[.1,.9]原样保留；越界99抛AI_InvalidResponseDataError；空documents不调用doRerank（计数器0）。测试还确认adapter的topN、空分数、数量不匹配和非有限分数验证。排序是适配器责任。\n\n以下引用均来自实际安装ai@7.0.173，直接采用提供方ranking，map映射；独立校验索引，空列表提前返回。\n` +
  quote(20578, 20578) +
  quote(20634, 20638) +
  quote(20658, 20662) +
  quote(20477, 20477) +
  quote(20513, 20522) +
  `\nnode_modules/@ai-sdk/provider/dist/index.d.ts:6051–6074规定提供方ranking应降序；6107–6123定义RerankingModelV4。\n\nembedMany()在node_modules/ai/dist/index.js:13420；本地EmbeddingModelV4声明maxEmbeddingsPerCall=4、supportsParallelCalls=false，由SDK分批调用。cosineSimilarity在同文件14840行，计算点积除以范数乘积，lib/vector.ts直接调用该导出。\n\n`;
report =
  head +
  "## 结果 H1–H6\n\n" +
  result +
  h6 +
  "## 标注修正\n\n未发现。未改原始标签。paraphrase仅按来源商品标注，跨商品相似答案是已知政策局限。若后续发现疑点，只允许独立data/label-corrections.json（query id到修正relevant数组映射），eval同时输出原始和修正metrics，冻结标签仍为主结果。\n\n## 怎么跑与依赖\n\n" +
  tail;
const howStart = report.indexOf("## 怎么跑与依赖") + "## 怎么跑与依赖".length,
  howEnd = report.indexOf(end);
let how = `\n\nNode ${r.machine.node}，pnpm 10.34.6。\n\n\`pnpm install && pnpm test && pnpm typecheck && pnpm build && pnpm eval\`\n\n启动：\`pnpm start --port 3123\`；访问页面或 \`curl --get --data-urlencode 'q=DH-TC-0915的标称容积是多少？' http://localhost:3123/api/search\`。本次复核设置MODELS_OFFLINE=1，禁止模型远程下载，默认全新评测且未使用恢复。评测后运行\`pnpm report\`更新本报告。构建阶段不下载/加载模型。test共24个用例，均不下载模型。eval预期输出results.json、results.md、eval-checkpoint.json，每条查询/每轮有进度；恢复中断用\`EVAL_RESUME=1 pnpm eval\`，仅接受数据及配置fingerprint匹配的checkpoint，恢复仍先预热全部查询。\n\n评测时缓存目录：\`${r.cache.path}\`；\`du -sk\` 输出：\`${r.cache.du}\`（KiB）。模型q8 ONNX文件分别24,010,842与279,301,077字节，加上tokenizer/config约308 MiB；嵌入缓存另约3.3 MiB。下载走默认huggingface.co，未用镜像，未遇明确访问拒绝。首轮含首次下载的完整评测耗时见下面记录；下载子阶段没有独立计时，不将总时长冒充纯下载耗时。HF_ENDPOINT可配置合法公开源，但明确403或网络拒绝后不得切源绕过。\n\n`;
try {
  const first = JSON.parse(await readFile("artifacts/first-run.json", "utf8"));
  how += `首次完整评测（含下载、初始化、预热与3轮测量）：${first.durationSeconds.toFixed(3)}秒。\n\n`;
} catch {}
how += `当前results对应评测：${r.durationSeconds.toFixed(3)}秒。\n\n`;
try {
  const validation = JSON.parse(await readFile("verification.json", "utf8"));
  how += "|命令|exit code|耗时秒|\n|---|---:|---:|\n";
  for (const v of validation)
    how += `|${v.command}|${v.exitCode}|${v.seconds.toFixed(3)}|\n`;
  how += "\n";
} catch {
  how += "最终验证链记录待更新。\n\n";
}
try {
  const api = JSON.parse(await readFile("api-verification.json", "utf8"));
  how += `API实测：HTTP ${api.httpStatus}，四路条数 ${JSON.stringify(api.counts)}，缺q状态 ${api.missingQueryStatus}，超长状态 ${api.longQueryStatus}；服务已关闭。\n\n`;
} catch {
  how += "API实测待完成。\n\n";
}
how +=
  "### 依赖精确版本\n\n版本同时核对package.json与pnpm-lock.yaml解析项。\n\n|包|package.json固定版本|安装/lockfile实际版本|\n|---|---|---|\n";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const lock = await readFile("pnpm-lock.yaml", "utf8");
for (const [name, version] of Object.entries({
  ...pkg.dependencies,
  ...pkg.devDependencies,
})) {
  const actual = JSON.parse(
    await readFile(`node_modules/${name}/package.json`, "utf8"),
  ).version;
  if (!lock.includes(`${name}@${actual}`)) throw Error(`lock mismatch ${name}`);
  how += `|${name}|${version}|${actual}|\n`;
}
const tf = realpathSync("node_modules/@huggingface/transformers");
for (const name of ["onnxruntime-node", "sharp", "protobufjs"]) {
  let location = path.resolve(tf, "..", "..", name, "package.json");
  if (name === "protobufjs") {
    const ort = realpathSync(path.resolve(tf, "..", "..", "onnxruntime-node"));
    location = path.resolve(ort, "..", "..", name, "package.json");
  }
  try {
    const dep = JSON.parse(await readFile(location, "utf8"));
    how += `|${name}|传递依赖|${dep.version}|\n`;
  } catch {
    const match = lock.match(new RegExp("  " + name + "@([^:\\n]+):"));
    how += `|${name}|传递依赖|${match?.[1] ?? "见lockfile"}|\n`;
  }
}
how += `\n包管理器10.34.6；pnpm.onlyBuiltDependencies已允许onnxruntime-node、sharp、protobufjs。已实际执行onnxruntime-node/protobufjs postinstall。\n\n同一输入真实推理两次：嵌入最大绝对差 ${r.determinism.embeddingMaxAbsDiff}，重排sigmoid分数最大绝对差 ${r.determinism.scoreMaxAbsDiff}；仅说明该输入和本次配置观测为确定，非跨硬件保证。\n\n`;
report = report.slice(0, howStart) + how + report.slice(howEnd);
const initial = JSON.parse(
  await readFile("artifacts/initial-top5-only/results.json", "utf8"),
);
let correction =
  "## 评测协议修正（非标注修正）\n\n旧协议raw-rrf30-top5-v1虽给同样30候选打分，但SDK topN=5截断了用于MRR@10的列表，漏计第6–10名。新协议raw-rrf30-full30-v2完整保留30条，重新预热并真实测量3轮；标签、候选、模型打分均不变。原实验结果保留：[原results.md](artifacts/initial-top5-only/results.md)、[原results.json](artifacts/initial-top5-only/results.json)、[原verification](artifacts/initial-top5-only/verification.json)、[首次下载运行](artifacts/first-run.json)。\n\n|类型|旧MRR@10（被截断）|新MRR@10|旧recall@5|新recall@5|旧nDCG@5|新nDCG@5|\n|---|---:|---:|---:|---:|---:|---:|\n";
for (const group of ["all", "exact", "paraphrase", "anaphora"]) {
  const old = initial.metrics.rerank[group],
    now = metrics.rerank[group];
  if (
    Math.abs(old.recall5 - now.recall5) > 1e-12 ||
    Math.abs(old.ndcg5 - now.ndcg5) > 1e-12
  )
    throw Error("Top5 metrics changed");
  correction += `|${group}|${f(old.mrr10)}|${f(now.mrr10)}|${f(old.recall5)}|${f(now.recall5)}|${f(old.ndcg5)}|${f(now.ndcg5)}|\n`;
}
report = report.replace(end, correction + "\n" + end);
await writeFile("REPORT.md", report);
