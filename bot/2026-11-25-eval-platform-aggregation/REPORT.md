# 3.2 重复试验展开与评测聚合

在同一份冻结 0/1 结果上，行级均值为 **93.33%**，通过 **85%** 闸门。题级 `pass^3` 为 **80%**，未通过同一闸门。`pass@3` 为 **100%**。

## 实现与源码对照

`lib/rules.ts` 用独立的 TypeScript 实现按轮复制、按题展开 trial、行级和题级聚合，以及 Braintrust reporter 的布尔判定。`lib/experiment.ts` 读取冻结夹具，CLI、测试和 Next.js 静态首页共用这套计算。本轮没有调用模型，没有调用 LangSmith 或 Braintrust API，运行时也没有安装这两个 SDK。

| 上游版本与 commit | 本地只读源码位置 | 核对内容 |
| --- | --- | --- |
| LangSmith JS `langsmith@0.14.0`（tag `v0.14.0`），`0a1ac4a3de051509caf8cefdd959968167efe877` | `src/lib/evaluation/_runner.ts:371–379` | 每轮追加整批原 example，保留 ID。 |
| 同上 | `src/lib/tests/evaluate.int.test.ts:143–195` | 2 条样本重复 3 次得 6 行，并检验每个 example ID 的出现次数。 |
| 同上 | `src/lib/evaluation/_runner.ts:941–973、1575–1598` | Summary evaluator 接收 `getExamples()` 返回的列表和 runs，单参数形式从这些列表映射出 inputs、outputs 和 referenceOutputs。 |
| Braintrust JS `braintrust@3.44.0`，`4c1d334f707d13a01ed1815ee7a0194c079c1e30` | `js/src/framework.ts:1686–1693` | 次数优先级为 `datum.trialCount ?? evaluator.trialCount ?? 1`，trialIndex 从 0 开始。 |
| 同上 | `js/src/framework.test.ts:1224–1271` | 全局 2、单题覆盖 5 和 1，分别断言总行数和各题索引。 |
| 同上 | `js/src/framework.ts:1906–2023` | `reportEval` 使用 `error !== undefined` 筛出失败行，`reportRun` 要求所有评测报告为 true。 |
| 同上 | `js/src/cli/reporters/eval.ts:186–226` | CLI reporter 使用相同的失败判断和布尔汇总。 |

官方 repetition 文档以 5 条样本各重复 5 次说明 25 次 run。官方 quality gate 示例累加每条 result 的分数，除以 result 行数，再与 0.85 比较。Braintrust 官方 CLI 说明把评测异常映射到默认非零退出码，低分本身不会触发失败。[LangSmith repetition](https://docs.langchain.com/langsmith/repetition) · [LangSmith quality gate](https://docs.langchain.com/langsmith/read-local-experiment-results) · [Braintrust CLI](https://www.braintrust.dev/articles/braintrust-cli-pro-tips)

## 预注册假设与结果

| 假设 | 预期与实测 | 结论 |
| --- | --- | --- |
| H1 LangSmith 式展开 | 预期 N 条重复 k 轮得到 N × k 行，每个 ID 出现 k 次。实测 5 × 5 = 25，每个 ID 出现 5 次。2 × 3 = 6，每个 ID 出现 3 次。测试另核对整批顺序和对象身份。 | 支持 |
| H2 行级均值与题级全对率 | 预期在 T=0.85、k=3 时行级均值过线，题级 `pass^3` 低于阈值。实测行级均值为 56/60 ≈ 0.933333，`pass@3` 为 20/20 = 1，`pass^3` 为 16/20 = 0.80。 | 支持 |
| H3 Braintrust 式展开 | 预期单题次数覆盖全局 2。实测得到 2+5+1=8 行，默认题、覆盖 5 的题、覆盖 1 的题的 trialIndex 分别为 `[0,1]`、`[0,1,2,3,4]`、`[0]`。 | 支持 |
| H4 朴素 summary | 预期直接计数重现行级均值并与两个题级指标不同。实测答对行数 / 总行数为 56/60，按 example ID 分组后重现 `pass@3 = 1` 和 `pass^3 = 0.80`。 | 支持 |
| H5 Braintrust 默认 reporter | 预期低分且无错误的评测返回 true，有错误的评测返回 false。实测全零且无错误返回 true，含一条带 error 的满分行返回 false。显式 `null` 也触发失败。两个成功报告合并返回 true，一成一败返回 false。单测覆盖 `reportEval` 和 `reportRun` 的返回值。 | 支持 |

行级均值为所有已展开行的 score 之和除以行数。`pass@k` 为按 example ID 分组后至少一次得 1 的题数除以总题数。`pass^k` 为 k 次全得 1 的题数除以总题数。这里直接统计冻结的 k 次观测。题级计算要求每个 ID 恰好拥有索引 0 到 k−1 的二元结果。

## 冻结夹具

全部夹具随实验提交，本轮选用了自造数据。对 H2 和 H4，`qid` 直接映射到 `example.id`，`scores` 数组位置对应从 0 开始的 trialIndex。`q01` 至 `q16` 为 `[1,1,1]`，`q17` 至 `q20` 为 `[1,1,0]`。

| 对应假设 | 夹具路径 | `sha256sum` |
| --- | --- | --- |
| H1、H3 | `data/expansion.json` | `0305b4ce9987b1d3b90c6bfc1bc1d1d47c0c737eedfa946f1fb6147c1cb97359` |
| H2、H4 | `data/stability.json` | `61784e0d630899da2b64099a8e6fe75d356936884a41172c05466f7556c06bc7` |
| H5 | `data/reporter.json` | `ce451eaee305ccc03bae8c15fabf1d7dc405daa0b279288c70a11eb8286d3124` |

## 复现与验收

在本实验目录使用 Node v24.22.1 和 pnpm 10.34.6。安装依赖后，测试、分析和静态构建只使用本地代码和夹具。

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
sha256sum data/*.json
```

| 命令 | 实测退出码 | 预期输出 |
| --- | --- | --- |
| `pnpm test` | 0 | Vitest 通过 6 项测试。 |
| `pnpm typecheck` | 0 | TypeScript 检查通过，无错误。 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 0 | 首页标记为静态预渲染，导出 `out/index.html`，展示 H1–H5。 |
| `pnpm analyze` | 0 | 输出 H1–H5 的 JSON。H2 的 `rowGate` 为 true，`stabilityGate` 为 false。 |

## 未解决的问题

Braintrust JS 的摘要读取逻辑在 `js/src/logger.ts:8418–8429` 从 `/experiment-comparison2` 取回 scores 和 metrics。服务端如何为重复 trial 聚合与加权，以及界面按 Input 分组后的统计量公式，仍未核实。LangSmith 目标函数或评估器出错导致 score 缺失时如何计入质量闸门分母，也超出本次完整二元夹具的验证范围。
