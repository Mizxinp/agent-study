# Prompt caching 评测结果

生成时间（Asia/Shanghai）：2026-11-17T16:40:45.609Z
Node v24.22.1，pnpm pnpm/10.34.6 npm/? node/v24.22.1 linux x64

下列数字来自真实 API `usage` 字段与官方单价的估算，不是账单。

## 提供商 anthropic / 模型 `claude-sonnet-5-5`

- 检索 / 断点模式：Anthropic explicit block-level cache_control (not top-level automatic caching)
- 稳定前缀：约 2156 tokens（8624 字符，chars/4 估算）
- 文档中的最低可缓存长度：512 tokens
- 单价来源：Anthropic Claude API pricing (and the Prompt caching page table)，抓取日期 2026-11-17，单位 USD per 1,000,000 tokens，文档 https://platform.claude.com/docs/en/about-claude/pricing
- 使用的单价：{"input":2,"cacheWrite5m":2.5,"cacheWrite1h":4,"cacheRead":0.1,"output":10}
- H3 对照：算术对照（两次都按未缓存输入单价计价），不是第三次关缓存实测
- H1 两次输入成本 9.438000e-4 USD，未缓存对照 1.595000e-2 USD，差额 1.500620e-2 USD

### 调用记录

- **H1 request 1 (write expected)**
  - 问题：In the product manual, what is the rated continuous power of SKU-1000? Reply with only the number and the unit.
  - usage：input=3990, noCache=41, cacheWrite=0, cacheRead=3949, output=5, cache_creation 5m=0 1h=0
  - 估算成本：输入 4.769000e-4 USD，输出 5.000000e-5 USD，合计 5.269000e-4 USD
  - 耗时：总 4714 ms，TTFT 4709 ms
- **H1 request 2 (read expected, question changed)**
  - 问题：In the product manual, what is the warranty period of SKU-1001? Reply with only the duration.
  - usage：input=3985, noCache=36, cacheWrite=0, cacheRead=3949, output=5, cache_creation 5m=0 1h=0
  - 估算成本：输入 4.669000e-4 USD，输出 5.000000e-5 USD，合计 5.169000e-4 USD
  - 耗时：总 3825 ms，TTFT 3726 ms
- **H2 request 1 (breakpoint on changing question)**
  - 问题：In the product manual, what is the rated continuous power of SKU-1000? Reply with only the number and the unit. (request marker: 2026-11-17T16:40:29.920Z)
  - usage：input=4013, noCache=4, cacheWrite=60, cacheRead=3949, output=5, cache_creation 5m=60 1h=0
  - 估算成本：输入 5.529000e-4 USD，输出 5.000000e-5 USD，合计 6.029000e-4 USD
  - 耗时：总 2812 ms，TTFT 2811 ms
- **H2 request 2 (breakpoint on changing question)**
  - 问题：In the product manual, what is the warranty period of SKU-1001? Reply with only the duration. (request marker: 2026-11-17T16:40:32.732Z)
  - usage：input=4008, noCache=4, cacheWrite=4004, cacheRead=0, output=5, cache_creation 5m=4004 1h=0
  - 估算成本：输入 1.001800e-2 USD，输出 5.000000e-5 USD，合计 1.006800e-2 USD
  - 耗时：总 3021 ms，TTFT 3020 ms

### H1：不确定

字段不完整或不典型：第一次 write=0 read=3949；第二次 write=0 read=3949，noCache=36。如实记录，不改数字。
### H2：不确定

可能出现提供商隐式断点或部分命中：第一次 write=60 read=3949；第二次 write=4004 read=0。如实记录字段，不改数字。
### H3：支持

H1 两次请求输入成本 9.438000e-4 USD，低于对照 1.595000e-2 USD（对照为按未缓存输入单价计算的算术对照，不是第三次实测关缓存请求）。
### H4：不确定

仅有一次配对样本：第一次 TTFT 4709 ms，第二次 3726 ms（第二次更快）。样本少、波动可能很大，不把单次差异写成确定结论。

## 提供商 openai / 模型 `gpt-5.6-sol`

- 检索 / 断点模式：OpenAI Responses explicit prompt_cache_options + prompt_cache_breakpoint
- 稳定前缀：约 2156 tokens（8624 字符，chars/4 估算）
- 文档中的最低可缓存长度：1024 tokens
- 单价来源：OpenAI API pricing (standard, short context) and the Prompt caching guide，抓取日期 2026-11-17，单位 USD per 1,000,000 tokens (standard, short-context tier)，文档 https://developers.openai.com/api/docs/pricing
- 使用的单价：{"input":4,"cachedInput":0.4,"cacheWrite30m":5,"cacheWrite12h":10,"output":20}
- H3 对照：算术对照（两次都按未缓存输入单价计价），不是第三次关缓存实测
- H1 两次输入成本 1.281380e-2 USD，未缓存对照 1.886400e-2 USD，差额 6.050200e-3 USD

### 调用记录

- **H1 request 1 (write expected)**
  - 问题：In the product manual, what is the rated continuous power of SKU-1000? Reply with only the number and the unit.
  - usage：input=2360, noCache=33, cacheWrite=0, cacheRead=2327, output=6, cache_write 30m=0 12h=0
  - 估算成本：输入 1.062800e-3 USD，输出 1.200000e-4 USD，合计 1.182800e-3 USD
  - 耗时：总 2417 ms，TTFT 2126 ms
- **H1 request 2 (read expected, question changed)**
  - 问题：In the product manual, what is the warranty period of SKU-1001? Reply with only the duration.
  - usage：input=2356, noCache=29, cacheWrite=2327, cacheRead=0, output=6, cache_write 30m=2327 12h=0
  - 估算成本：输入 1.175100e-2 USD，输出 1.200000e-4 USD，合计 1.187100e-2 USD
  - 耗时：总 2340 ms，TTFT 2125 ms
- **H2 request 1 (breakpoint on changing question)**
  - 问题：In the product manual, what is the rated continuous power of SKU-1000? Reply with only the number and the unit. (request marker: 2026-11-17T16:40:40.512Z)
  - usage：input=2381, noCache=3, cacheWrite=2378, cacheRead=0, output=6, cache_write 30m=2378 12h=0
  - 估算成本：输入 1.190200e-2 USD，输出 1.200000e-4 USD，合计 1.202200e-2 USD
  - 耗时：总 2887 ms，TTFT 2725 ms
- **H2 request 2 (breakpoint on changing question)**
  - 问题：In the product manual, what is the warranty period of SKU-1001? Reply with only the duration. (request marker: 2026-11-17T16:40:43.399Z)
  - usage：input=2377, noCache=3, cacheWrite=2374, cacheRead=0, output=6, cache_write 30m=2374 12h=0
  - 估算成本：输入 1.188200e-2 USD，输出 1.200000e-4 USD，合计 1.200200e-2 USD
  - 耗时：总 2209 ms，TTFT 1805 ms

### H1：不支持

两次都没有写入或命中（第一次 write=0 read=2327；第二次 write=2327 read=0）。若两次 input 都低于最低可缓存长度，应先加长稳定前缀再判定。
### H2：支持

两次主要是写入或缓存字段接近 0（第一次 write=2378 read=0；第二次 write=2374 read=0），不像 H1 那样的前缀命中。
### H3：支持

H1 两次请求输入成本 1.281380e-2 USD，低于对照 1.886400e-2 USD（对照为按未缓存输入单价计算的算术对照，不是第三次实测关缓存请求）。
### H4：不确定

仅有一次配对样本：第一次 TTFT 2126 ms，第二次 2125 ms（第二次更快）。样本少、波动可能很大，不把单次差异写成确定结论。

