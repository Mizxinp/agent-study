这是 ai-expert 的实践 demo 目录，每个子目录是一次可复现实验，含可运行代码、实测结果和报告。

- [2026-11-15-context-window](2026-11-15-context-window/)：长对话上下文窗口管理策略对比（滑窗 / 摘要 / BM25 / 结构化笔记）。报告见该目录 `REPORT.md`。
- [2026-11-16-langgraph-store-checkpointer](2026-11-16-langgraph-store-checkpointer/)：LangGraph 两层 persistence 对比（Checkpointer / MemorySaver 保存线程图状态，Store / InMemoryStore 保存跨线程 KV）。报告见该目录 `REPORT.md`。
- [2026-11-17-hybrid-retrieval-rerank](2026-11-17-hybrid-retrieval-rerank/)：中文合成陶瓷知识库的 BM25 / 向量 / RRF 与相对分数融合 / 本地 CPU 重排实测，含48条冻结查询及报告。
- [2026-11-18-multimodal-rag](2026-11-18-multimodal-rag/)：合成陶瓷商品图的字幕检索 / 视觉检索 / 简单融合对比（本地 CPU，无 API key）。报告见该目录 `REPORT.md`。
- [2026-11-18-agentic-rag-loop](2026-11-18-agentic-rag-loop/)：Agentic RAG 工具循环（search / filterProducts / answer）与固定单次 RAG 对比，含 AI SDK 7.0.176 循环机制（stopWhen / prepareStep / 工具错误回流）mock 测试。报告见该目录 `REPORT.md`。
