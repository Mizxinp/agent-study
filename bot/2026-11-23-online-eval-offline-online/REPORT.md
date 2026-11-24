# 冻结轨迹中的线上启发式、局部成功与离线回归

用 2.3 已冻结的 240 条轨迹模拟参考无关的线上打分，再用冻结的集合精确匹配标签做离线对照。40 道合成题在 fixed 和 agentic 各运行三轮，每条轨迹计一次。Next.js 首页只读展示题面、当时答案、启发式结果及离线金标。

## 预注册假设与验证结果

### H1　参考无关启发式与精确匹配在非平凡子集上不一致 · 支持

- `skuSet` 检查行级 `answer` 是已记录的 SKU 数组，元素符合 `DH-[A-Z]{2}-[0-9]{4}` 且无重复。空数组合法，`null` 失败。只检查形状，不查询商品目录。
- `noToolError` 检查所有步骤的 `toolResults` 是否有 `error: true`。通过只表示未记录显式工具错误。调用后没有结果也可能通过，不能据此宣称工具执行成功。
- 两条规则分别在 fixed 和 agentic 内计算。fixed 的 120 条都只有一步，且只有 `answer` 调用。缺少 search 不算失败。agentic 的记录有 2–6 步，实际观测上界为 6。240 条行级 `finishReason` 都是 `tool-calls`。两条规则均不靠步数或 finish reason 推定失败。

| 管线 | 启发式 | 启发式通过率 | 离线精确匹配 | 启发式通过且金标失败 | 启发式失败且金标通过 |
| --- | --- | ---: | ---: | ---: | ---: |
| fixed | SKU 形状 | 120/120（100.00%） | 92/120（76.67%） | 28/120（23.33%） | 0/120（0.00%） |
| fixed | 无显式工具错误 | 120/120（100.00%） | 92/120（76.67%） | 28/120（23.33%） | 0/120（0.00%） |
| agentic | SKU 形状 | 116/120（96.67%） | 116/120（96.67%） | 0/120（0.00%） | 0/120（0.00%） |
| agentic | 无显式工具错误 | 118/120（98.33%） | 116/120（96.67%） | 2/120（1.67%） | 0/120（0.00%） |

fixed 的两条规则都放过同一批 28 条失败，任一规则都无法单独判定正确性。Agentic 的 SKU 形状在本样本中恰好完全一致，这个切片不支持 H1；无显式工具错误则放过两条走到 6 步、没有 `answer` 调用、行级答案为 `null` 的轨迹。另两条 agentic 失败在第 3 步有显式 `answer` 输入校验错误。判断仅使用冻结中实际记录的字段。

启发式通过率只描述规则。离线标签使用 2.3 的 `correct`，其口径是去重、去首尾空白并转大写后的 SKU 集合相等，`null` 一律失败。代码通过白名单构造 `OnlineTrace`，类型拒绝带 `gold`、`correct` 或 `f1` 的冻结行。测试改写这些离线字段后，启发式结果逐条一致。

### H2　局部成功率高于同一子集端到端精确匹配率 · 支持

可评估子集是首步有 `search` 调用的 agentic 轨迹，本集有 120 条。局部成功要求同一步的 `toolResults` 中至少一个 `search` 结果有非空 `summary` 且无 `error: true`。结果按步骤和工具名判定，冻结数据没有用来逐一配对并行同名调用的 ID。结果摘要可证明记录了执行结果，无法证明检索内容满足题意。

| 子集 | 首步 search 执行成功 | 同批端到端精确匹配 | 差值 |
| --- | ---: | ---: | ---: |
| agentic 首步调用 search | 120/120（100.00%） | 116/120（96.67%） | +3.33 个百分点 |

### H3　失败轨迹可稳定提升为离线回归题 · 支持

提升任一 H1 规则失败或离线精确匹配失败的记录。共保留 32/240 条（fixed 28/120，agentic 4/120），其中 4 条也有启发式失败。题面由 `qid` 联接冻结题集，经 Unicode NFKC、去首尾空白和折叠连续空白后作为去重键。保留每道题的全部入选记录，最终得到 13 道题。按规范化题面排序，题内轨迹按 qid、管线、轮次排序。每条记录保留行级答案与理由、失败规则、可观察的结束和步骤信息、显式错误摘要，以及建议的 SKU 集合断言和对应失败规则断言。断言只作离线标注。时间来自冻结评测的 `meta.endedAt`。

两次独立提升逐字节一致，且与提交的 `data/regression.json` 一致。SHA-256 为 `b0e331ab405ed26d13acf709f2b4fc46a8a95a24ae4211dd185616a0fa7c0dea`，记录于 `data/regression.sha256`。

## 冻结来源与核验

仓库 2.3 目录为 `bot/2026-11-18-agentic-rag-loop/`，取自 `origin/main` 的 `37bc3eefe3536fe2cb70b94ff1ee5dd3eab481b7`。两份源与 demo 副本均做字节比较并验证 SHA-256、Git blob，测试、分析和提升均在前后核验。

| 2.3 文件 | SHA-256 | Git blob | 首次纳入提交 |
| --- | --- | --- | --- |
| `results.json` | `067821e5a441e8a9f15292faf06c9d5e2a38b30ad145400b927a5f89a530aa5f` | `fd761b71959e7bfdf7f5728c9d074aca3b7abed0` | `f6f5d160777acc6cf77034b845105fdf3eb068ad` |
| `data/questions.json` | `4b44e4ca2e21547160944325d0f50a47ab22581af36a63f54f6916ae0dda3f16` | `d3a3566c305b2f179aa7568d0df878ea0cd4b862` | `ae5074469b1549999194bf5dc1c8915913b29ad3` |

## 复现

从本 demo 目录运行。验证环境为 Node.js 24.22.1、pnpm 10.34.6。依赖缓存已备齐时，第一条命令可以加 `--offline`。后续命令均离线运行。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm eval

tmp_dir=$(mktemp -d)
pnpm promote "$tmp_dir/first.json"
pnpm promote "$tmp_dir/second.json"
cmp "$tmp_dir/first.json" "$tmp_dir/second.json"
cmp "$tmp_dir/first.json" data/regression.json
(cd data && sha256sum -c regression.sha256)
```

预期 6 个测试通过，类型检查和构建退出码为 0，构建生成静态首页。 `pnpm eval` 打印上述分管线计数、+3.33 个百分点、13 道题、32 条失败记录及提升文件哈希。两次 `cmp` 均退出 0。可运行 `pnpm start` 查看构建后的首页。验收日志位于 `/workspace/scratch/codex-online-eval-2026-11-23/logs/`。

## 结论边界

本集是小规模的合成冻结轨迹。同一道题跨轮次重复，轨迹数并不等于独立题数。结果限于这批轨迹，不能外推到生产流量，也不能用线上启发式替代正确性评测。本轮未重跑模型或 2.3 评测，未调用线上生成或 LLM judge，未修改 2.3，未 push。
