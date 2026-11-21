# Agentic RAG 循环 vs 固定单次 RAG（主题 2.3）

在 16 个虚构陶瓷 SKU 与 40 条手写题上，对比固定单次 RAG（`fixed`）和带工具循环的 Agentic RAG（`agentic`）。本目录是独立 demo，没有改动 11-15 / 11-16 / 11-17 的代码或报告。评测使用 CR 兼容接口上的 `claude-haiku-5-5`，**不是官方 Anthropic 端点**。

**样本很小（16 个合成 SKU、40 题；单跳 13、多跳/比较 14、Null 13），多跳 agentic 精确匹配已达 100%，存在天花板效应。以下数字只在本合成集、单一模型、单一兼容网关上成立，不能外推到大库、没有结构化属性表的语料，或线上指标。**

完整逐题明细见 `results.md`，机器可读结果见 `results.json`。本报告数字与这两份文件以及 `results.json` 的 `summary` / `meta` 一致，评测完成后没有改过 results 里的数字，也没有重跑 `pnpm eval`。

## 结论一览

| 假设 | 结论 | 关键数字 |
|---|---|---|
| H1 多跳/比较：agentic 精确匹配高于 fixed | **支持** | agentic 1.0 vs fixed 0.4048；配对 25/0/17，符号检验 p&lt;0.001 |
| H2 单跳：agentic 不明显更准，但成本更高 | **支持** | 精确匹配 1.0 vs 0.9487，p=0.5（不显著）；总 token 5493 vs 2528，净延迟 p50 7259 vs 3169 ms，平均步数 2.21 vs 1 |
| H3 Null：agentic 更会拒答、更少幻觉 | **不确定** | 精确匹配 0.8974 vs 0.9744，p=0.375；agentic 4 次失败都是未作答，不是交错 SKU |
| H4a `generateText` 默认 1 步 | **支持** | `pnpm test`（mock，`tests/loop-mechanics.test.ts`） |
| H4b `ToolLoopAgent` 默认 20 步并告警 | **支持** | 同上 |
| H5 每一步都评估全部 `stopWhen` 条件 | **支持** | 同上 |
| H6 工具抛错变为 `tool-error`，下一步 prompt 含错误文本后改参成功 | **支持** | 同上 |
| H7 `finishReason=length` 时不执行工具，循环停在第 1 步 | **支持** | 同上 |
| H8 `prepareStep` 替换的 messages 成为后续步基线 | **支持** | 同上 |

## 做了什么

- 语料：2.1 混合检索的虚构陶瓷正文 + 本目录新增的结构化属性表（釉色、器型、容量、价格、上架日期等）。16 个 SKU 全部为合成数据。
- 问题集：40 条手写题，标准答案是 SKU 集合或空集。冻结后再评测，见下方版本信息。
- 两条路线：
  - `fixed`：BM25 + `Xenova/bge-small-zh-v1.5` 混合检索（RRF）top-8 → 一次生成，强制 `toolChoice=answer`，1 步。
  - `agentic`：工具 `search`（混合检索 top-5）/ `filterProducts`（按属性表过滤）/ `answer`；`stopWhen: [isStepCount(6), hasToolCall('answer')]`；第 1 步由 `prepareStep` 把 `toolChoice` 设为 `search`，之后恢复 `auto`。
- 页面 + `POST /api/ask`（body：`question`、`pipeline`）。空对象、空问题或非法 JSON 返回 **400** 与明确错误；未配置 LLM 时问答返回 503。页面路径用 `streamText` 推 NDJSON 步骤轨迹。
- H4–H8 用 `MockLanguageModelV4` 单测覆盖，不打真实模型、不需要密钥。另有一条单测确认第 1 步 `toolChoice=search`、之后恢复 `auto`。

## 版本与冻结

| 项 | 值 |
|---|---|
| Next.js | 16.4.6 |
| `ai` | **7.0.176**（钉死，不要升到窗口内已出现的 7.0.178 / 7.0.179） |
| `@ai-sdk/provider` | 4.0.39 |
| 检索 / 向量 | BM25（汉字二元组 + 型号）+ `Xenova/bge-small-zh-v1.5`（q8），RRF k=60，每路边 30 候选 |
| 问题集冻结提交 | `ae50744`（2026-11-18 21:05:27 Asia/Shanghai） |
| `questionsFinalizedAt` | 2026-11-18T21:05:27+08:00（与冻结提交时间一致） |
| 模型 | `claude-haiku-5-5` |
| 提供商 / 网关 | `anthropic` 兼容路径，host `api.creative-reasoning.com`（CR 兼容接口，**不是官方 Anthropic**） |
| temperature | 未设置（使用模型端默认值；结果写明 `claude-haiku-5-5` 会忽略 temperature） |
| RUNS | 3（单跳/Null 各 n=39，多跳 n=42，全部 n=120；不是丢题） |
| 并发 | 1 |
| SDK 重试 / 整题重跑 | `LLM_MAX_RETRIES=6`，`JOB_ATTEMPTS=4`，单步超时 `STEP_TIMEOUT_MS=90000` |
| 起止（与 `results.meta` 一致） | 开始 2026-11-18T13:35:27.326Z = **2026-11-18 21:35:27 Asia/Shanghai**；结束 2026-11-19T00:51:30.381Z = **2026-11-19 08:51:30 Asia/Shanghai** |
| 耗时 | 40563 s（约 11.3 小时），退出码 0，240/240 |

## 汇总数字

口径与 `results.md` / `results.json` 的 `summary` 一致。比较路线成本请看**净延迟**（扣除 429/失败请求及其退避等待），不要用被挂起拉高的墙钟均值。

| 题型 | 路线 | n | 精确匹配 | 平均 F1 | 拒答率 | 未作答率 | 平均总 token | 净延迟 p50/p95 ms | 墙钟 p50/p95 ms | 平均步数 |
|---|---|---:|---:|---:|---:|---:|---:|---|---|---:|
| 单跳 | fixed | 39 | 0.9487 | 0.9829 | 0 | 0 | 2528.1026 | 3169/6094 | 3169/6094 | 1 |
| 单跳 | agentic | 39 | 1.0000 | 1.0000 | 0 | 0 | 5493.4359 | 7259/19283 | 7600/59948 | 2.2051 |
| 多跳/比较 | fixed | 42 | 0.4048 | 0.4345 | 0.3095 | 0 | 2469.881 | 3119/5677 | 3119/5677 | 1 |
| 多跳/比较 | agentic | 42 | 1.0000 | 1.0000 | 0 | 0 | 9249.5 | 12459/27983 | 12514/33103 | 3.0476 |
| Null | fixed | 39 | 0.9744 | 0.9744 | 0.9744 | 0 | 2437.7436 | 3169/6144 | 3169/6144 | 1 |
| Null | agentic | 39 | 0.8974 | 0.8974 | 0.8974 | 0.1026 | 10291.4359 | 10949/28354 | 11002/28354 | 3.2308 |
| 全部 | fixed | 120 | 0.7667 | 0.7882 | 0.425 | 0 | 2478.3583 | 3167/5765 | 3167/5765 | 1 |
| 全部 | agentic | 120 | 0.9667 | 0.9667 | 0.2917 | 0.0333 | 8367.4083 | 9623/23700 | 10703/33222 | 2.8333 |

配对比较（同题同轮，agentic 对 fixed；符号检验为精确双侧）：

| 题型 | agentic 赢 | fixed 赢 | 平 | 符号检验 p（双侧） |
|---|---:|---:|---:|---|
| 单跳 | 2 | 0 | 37 | 0.5 |
| 多跳/比较 | 25 | 0 | 17 | &lt; 0.001（`results` 里记为 0；独立重算约为 5.96×10⁻⁸） |
| Null | 1 | 4 | 34 | 0.375 |
| 全部 | 28 | 4 | 88 | &lt; 0.001（`results` 里记为 0；独立重算约为 1.93×10⁻⁵） |

agentic 工具调用次数：`search` 196、`filterProducts` 109、`answer` 118。第 1 步除 search 外还并行调用了其他工具 **66** 次；第 1 步多工具并行 **69** 次。

## H1 支持（多跳/比较）

多跳/比较题上 agentic 精确匹配 **1.0**，fixed 只有 **0.4048**；42 对里 agentic 赢 25、fixed 赢 0、平 17，p&lt;0.001。agentic 平均约 3.05 步，常用 `search` + `filterProducts`。

fixed 的典型失败是一次 top-8 检索吃不下「先找参照再按属性过滤」。例如：

- m01 三轮都交成错误 SKU `DH-CP-1374`（标准答案是 `DH-BW-0321, DH-HP-1152`）。
- m05 / m06 三轮都直接交空集（标准答案分别是三只碗、以及 `DH-BW-0654`）。

**1.0 很可能是天花板效应**：只有 16 个 SKU，过滤工具直接打结构化属性表，题目几乎就是为这个工具设计的，不能外推。

## H2 支持（单跳）

单跳上 agentic 精确匹配略高（**1.0 vs 0.9487**），但符号检验 **p=0.5，不显著**（仅 s10 第 1、2 轮 agentic 赢）。代价明确更高：平均总 token 约 **2.2 倍**（5493.4359 vs 2528.1026），净延迟 p50 约 **2.3 倍**（7259 vs 3169 ms），平均 **2.2051** 步对 1 步。

fixed 仅有的错误是 s10 两轮把「手塑堆花」多交了一个 SKU（`DH-XP-0827` 之外多了 `DH-HP-1152`）。单跳不应默认走循环。

## H3 不确定（Null）

Null 题上 agentic 略差（**0.8974 vs 0.9744**），p=0.375，不能下「循环更会拒答」的结论。

失败形态必须写明：agentic 的 4 次失败都是 **未作答（`answer=null`）**，不是交了错误或交错 SKU。

- **n04 第 2、3 轮**：都调用了 `answer`，但把 `skus` 写成非法字符串（夹了 XML 残片，例如 `"[]</individual>\n"`、`"[]</names>\n<parameter name=\"rationale\">…"`），参数校验失败后循环在第 3 步结束，没有成功提交空数组。
- **n11 第 1、2 轮**：在 6 步预算里只反复调用 `search`，打满 6 步仍未调用 `answer`。

fixed 只错 1 次： **n09 第 2 轮错误返回商品表中已有的SKU `DH-TC-0915`**（标准答案为空集）。也就是说，循环在「信息不足」时更容易卡在工具里或交坏参数，而不是更会编答案。配对上这 4 次是 fixed 赢，n09 第 2 轮是 agentic 赢。

工程含义：循环必须处理「到顶仍未调用 answer」和「answer 参数校验失败」。可以把非法 `answer` 当成可重试的工具错误，而不是直接记未作答。

## H4–H8 支持（mock 单测，无需密钥）

`tests/loop-mechanics.test.ts` 在本环境 `pnpm test` 中全部通过（2026-11-21 09:03 Asia/Shanghai，15 passed / 2 files，与先前验收一致）：

- **H4a**：`generateText` 默认执行一次工具并在第一步停止。
- **H4b**：`ToolLoopAgent` 默认在第 20 步停止并发出警告。
- **H5**：三个 `stopWhen` 条件每步都被调用，第三步命中后停止。
- **H6**：工具抛错变为 `tool-error`，下一步 prompt 含错误文本后改参成功。
- **H7**：`finishReason=length` 时工具不执行，循环停在第 1 步。
- **H8**：`prepareStep` 替换的 messages 成为后续步骤的历史基线。

另有一条确认：第 1 步 `toolChoice=search`，之后恢复 `auto`。这些与 SDK 源码判断一致，测试用 `MockLanguageModelV4`，未 mock 真实评测。

## 两个工程观察

### 1. `toolChoice=search` 挡不住同一步并行的其他工具

120 次 agentic 里，第 1 步虽设置 `toolChoice=search`，仍有 **66/120** 次在同一步并行调用了其他工具（多为 `filterProducts`）；第 1 步多工具并行共 69 次。单测证明 SDK 有把 `toolChoice` 传给模型；这是模型/提供商在并行工具调用下的行为，不能假设「强制 search」等于「这一步只有 search」。若必须独占，需要再查 Anthropic `tool_choice` 的实际映射，或在 `prepareStep` 里用 `activeTools` 先关掉 `filterProducts` / `answer`。

### 2. 比较延迟用净延迟，不要用被挂起拉高的墙钟均值

评测从 2026-11-18 21:35 跑到 2026-11-19 08:51（Asia/Shanghai），中间多次 429 与挂起。净延迟定义为扣除失败/429 请求及其退避等待（见 `lib/request-timing.ts` 的 `netLatency`）。例如：

- s12 agentic 第 3 轮：墙钟约 **2.00 小时**（7,211,675 ms），净延迟只有 **9,454 ms**。
- n11 agentic 第 2 轮：墙钟约 **3.51 小时**（12,641,455 ms），净延迟 **33,423 ms**。

这也能解释为什么单跳 agentic 的墙钟均值（202,479 ms）远高于净延迟均值（8,849 ms）和净延迟 p50（7,259 ms）。比较路线成本请用净延迟 p50/p95。

## 样本与外部效度（必须写明）

16 个合成 SKU、40 条手写题（单跳 13 / 多跳 14 / Null 13）、单一模型、单一兼容网关、temperature 默认、每题 3 轮。数字只看方向，尤其不要把多跳 100% 当成可上线指标。

## 怎么跑起来

只写环境变量名，不写值。密钥不要放进仓库、终端回显或本报告。

评测 / 页面问答需要 CR 兼容接口，所选接口的密钥和 base URL 均为必填。

- `ANTHROPIC_API_KEY`（Anthropic Messages 兼容接口的密钥）
- `ANTHROPIC_BASE_URL`（必须显式给出，且以 `/v1` 结尾；SDK 只追加 `/messages`。自定义兼容 base 还会发 `Authorization: Bearer`）
- 使用 OpenAI 兼容接口时，`OPENAI_API_KEY` 为接口密钥，`OPENAI_BASE_URL` 必须显式给出且以 `/v1` 结尾。选填变量为 `LLM_MODEL`（模型）和 `LLM_PROVIDER`（接口提供商）。

评测可选控制包括 `RUNS`（每题运行轮次）、`CONCURRENCY`（并发数）、`JOB_ATTEMPTS`（单个任务的最大尝试次数）、`LLM_MAX_RETRIES`（模型请求的最大重试次数）、`STEP_TIMEOUT_MS`（单步超时，单位为毫秒）、`EVAL_LIMIT`（调试时限制评测题数）和 `EVAL_RESUME`（控制是否从检查点恢复）。本地向量缓存相关的选填变量包括 `HF_ENDPOINT`（模型下载端点）和 `MODELS_OFFLINE`（模型离线模式）。

在本目录执行：

```bash
pnpm install
pnpm test          # 无 key 可跑；预期 2 files / 15 passed（含 H4–H8 与输入校验）
pnpm typecheck
pnpm build
pnpm eval          # 需要上述密钥与显式 base URL；无 key 时打印 SKIPPED 并以退出码 2 结束，不写 results.*，绝不 mock
pnpm dev           # 或 pnpm start（需先 build）：页面 / 以及 POST /api/ask
```

预期：

- `pnpm test` / `typecheck` / `build` 退出码 0。空 `POST /api/ask` 返回 400。
- 无 key 时 `pnpm eval` 的 LLM 部分应跳过（退出码 2），H4–H8 仍能靠 `pnpm test` 跑。
- 有 key 时不要随意重跑完整 `pnpm eval`：本次真实评测已耗时 40563s，且会再打 CR。

`.gitignore` 已排除 `.env`、`node_modules/`、`.next/`、`.model-cache/`、`eval-checkpoint.jsonl` 等，不要把它们或密钥提交进仓库。

## 本环境复核（未改 results 数字，未重跑 eval）

2026-11-21 对已有 `results.json`（240 行）、`results.md` 与 `eval-checkpoint.jsonl` 做了独立核对：

- 检查点与 `results.json` 在 `correct` / `f1` / token / `latencyMs` / `netLatencyMs` / `failedRequests` 等字段上 240/240 逐条一致。
- 按原始行重算准确率、F1、拒答率、未作答率、平均 token、平均步数、失败请求数、分轮准确率、配对胜负，与 `summary` / `results.md` 一致。
- 符号检验 p 值：单跳 0.5、Null 0.375 与文件一致；多跳与全部因小于展示精度在 `results` 里记为 0，独立精确值为约 5.96×10⁻⁸ 与 1.93×10⁻⁵，均满足 p&lt;0.001。
- 个别延迟 p50 存在 1ms 量级的分位取整差：用与源码相同的线性插值后，`multi/fixed` 与 `all/fixed` 的 p50 落在 x.5，JavaScript `Math.round`（results 所用）得到 3119 与 3167，Python 银行家舍入会得到 3118 与 3166。不影响任何假设结论，**未改 results 中的数字**。
- 2026-11-21 09:03 Asia/Shanghai 再次运行 `pnpm test`（15 passed）、`pnpm typecheck`、`pnpm build`（Next.js 16.4.6），退出码均为 0。
