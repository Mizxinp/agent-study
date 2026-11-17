# Prompt caching 成本与断点实测（2026-11-17）

用真实 API usage 验证 Anthropic / OpenAI 官方 Prompt caching 文档，以及 Vercel AI SDK `ai@7.0.173` 把 `providerOptions` 映射到各家缓存字段的方式。这不是聊天产品。

完整说明、假设结论和复现步骤见 [REPORT.md](REPORT.md)。
