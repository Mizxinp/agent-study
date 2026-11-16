# LangGraph Store vs Checkpointer

验证 LangGraph 两层 persistence：`MemorySaver`（按 thread 保存图状态）与 `InMemoryStore`（跨 thread 的 KV）。

钉住 `@langchain/langgraph@1.7.4`。完整说明、H1–H5 结论和复现步骤见 [REPORT.md](./REPORT.md)。

```bash
pnpm install
pnpm test && pnpm typecheck && pnpm build
pnpm dev
```
