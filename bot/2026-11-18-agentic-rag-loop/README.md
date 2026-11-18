# 2026-11-18 Agentic RAG 循环 vs 固定单次 RAG（主题 2.3）

合成陶瓷商品库（2.1 语料 + 新增结构化属性表，全部虚构）上对比：

- `fixed`：一次 BM25 + `Xenova/bge-small-zh-v1.5` 混合检索（RRF）top-8 → 一次生成（强制调用 `answer` 输出型号集合）。
- `agentic`：`generateText` / `streamText` + 工具 `search` / `filterProducts` / `answer`，`stopWhen: [isStepCount(6), hasToolCall('answer')]`，第 1 步 `prepareStep` 强制 `toolChoice` 为 `search`。

```bash
pnpm install && pnpm test && pnpm typecheck && pnpm build   # 无 key 可跑，含 H4–H8 mock 测试
pnpm eval   # 需要 CR 兼容 key + 显式 base URL，见 REPORT.md；无 key 时打印 SKIPPED 并退出码 2
pnpm start  # 页面 + POST /api/ask（空请求返回 400）
```

结论与复现细节见 [REPORT.md](REPORT.md)，逐题明细见 `results.md` / `results.json`。
