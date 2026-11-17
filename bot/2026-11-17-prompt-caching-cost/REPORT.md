# Prompt caching 成本与断点实测（2026-11-17）

验证 Anthropic Messages 与 OpenAI Responses 的官方 Prompt caching 行为，以及 Vercel AI SDK `ai@7.0.173`（上游 commit `0e8e0543aeda7d4dd4ce6eade0d5b7d5a43644c1`）如何把 `providerOptions` 映射到请求 JSON 和 `usage` 字段。这不是聊天产品。

钉住版本（package.json 与 pnpm-lock.yaml 一致，无浮动区间）：

- `ai@7.0.173`
- `@ai-sdk/anthropic@4.0.105`
- `@ai-sdk/openai@4.0.118`（与 `ai@7.0.173` 使用同一套 `@ai-sdk/provider@4.0.38` / `@ai-sdk/provider-utils@5.0.81`，是撰写时 npm 上与该 `ai` 版本兼容的最新 4.0.x）
- Next.js `16.4.6`（App Router，当前稳定版，非 canary）
- React `19.3.1`，TypeScript `7.0.2`，Vitest `5.1.0`，zod `4.6.7`

文档（2026-11-17，Asia/Shanghai 抓取，代码与报告按当时措辞实现）：

- https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- https://platform.claude.com/docs/en/about-claude/pricing
- https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI 单价另见 https://developers.openai.com/api/docs/pricing

## 做了什么

- `lib/prefix.ts`：构造一段不含时间戳的稳定商品手册前缀。默认目标约 2048 tokens（按 `chars/4` 估算），高于当前默认模型的最低可缓存长度（Claude Sonnet 5.5 为 512，GPT-5.6 及之后为 1,024；隐藏的 OpenAI system tokens 不计入该最低值）。
- `lib/prompts.ts`：H1 把断点打在稳定前缀（system 消息）末尾；H2 只把标记打在带时间戳的当前问题上；对照请求不加任何缓存标记。Anthropic 不使用请求顶层 `cache_control`（那会打开自动缓存，把断点移到最后一个可缓存块，也就是变化的问题）。OpenAI 使用 Responses API 的 `prompt_cache_options.mode: "explicit"`。
- `lib/usage.ts` / `lib/cost.ts`：解析 AI SDK 的 `LanguageModelUsage` 与提供商 `usage.raw`，再用可修改的官方单价常量估算成本。单价注明文档与抓取日期，不当成账单。
- `lib/experiment.ts` + `scripts/eval.ts`：有密钥时连续调用（H1 两次、H2 两次），记录 usage、估算成本与 TTFT；若第一次看起来短于最低可缓存长度，会把前缀加长到 4096 / 8192 再试，不把过短提示当成失败。没有密钥时打印清楚的缺变量信息并以非 0 退出，不写伪造的 `results.json`。
- `tests/h5-cache-control.test.ts`：用自定义 `fetch` 拦截发出的 Anthropic 请求 JSON，覆盖 H5。`tests/cost-usage.test.ts` 用夹具对象测解析和算术，不用 mock 的实况 usage。
- `app/page.tsx`：最小说明页。无密钥时可打开，解释 H1–H4 需要密钥、H5 由测试覆盖。若之后设置了密钥，可通过 `pnpm eval` 或页面按钮跑真实评测。

默认模型（可用 `ANTHROPIC_MODEL` / `OPENAI_MODEL` / `GATEWAY_MODEL` 覆盖）：

- Anthropic：`claude-sonnet-5-5`（文档中的 Claude Sonnet 5.5，最低可缓存长度 512）
- OpenAI Responses：`gpt-5.6-sol`（官方定价表中的 GPT-5.6 型号，支持 `prompt_cache_options`；`createOpenAI()(modelId)` 在 `@ai-sdk/openai@4.0.118` 中默认走 Responses，不必再写 `.responses()`）
- 仅有 `AI_GATEWAY_API_KEY` 时：经 Vercel AI Gateway 跑一个型号，默认 `anthropic/claude-sonnet-5-5`，报告需写明实际落到的模型 id

输出尽量短：固定短问题，默认 `maxOutputTokens=16`，`temperature=0`。OpenAI 侧额外设置 `reasoningEffort: "low"` 以降低推理 token。预热默认关闭（`EVAL_PREWARM=1` 才开启）：Anthropic 走 `maxOutputTokens: 0`；OpenAI 走 `promptCacheOptions.prewarm: true`。若启用，预热成本在结果里单列，不计入 H1 的两次对比。

### 单价常量（USD / 百万 tokens）

抓取日期：2026-11-17。

Claude Sonnet 5.5（[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)）：未缓存输入 $2，5 分钟写入 $2.50，1 小时写入 $4，命中 $0.10（脚注：Sonnet 5.5 命中为基价的 0.05×），输出 $10。

`gpt-5.6-sol` 标准短上下文（[OpenAI pricing](https://developers.openai.com/api/docs/pricing)）：未缓存输入 $4，缓存命中 $0.40，30 分钟写入 $5，12 小时写入 $10，输出 $20。官方说明：写入价是该部分 token 的总费率，不是叠在未缓存输入之上的附加费。

H3 对照默认是**算术对照**：把 H1 两次请求的全部 input tokens 都按未缓存输入单价计费，与按 usage 字段拆分后的估算输入成本比较。报告会写明这是计算值，不是第三次关闭缓存的实测对照。

## 结果

本环境在实现时确认：`OPENAI_API_KEY`、`ANTHROPIC_API_KEY`、`AI_GATEWAY_API_KEY` 都未设置。因此没有调用真实模型，也没有生成 `results.json` / `results.md`，更没有编造 usage 数字。

评测命令：`pnpm test`（Vitest 5.1.0）。本环境实测 **11 passed**（3 条 H5 请求拦截断言 + 成本/解析/前缀夹具测试）。退出码见下方「怎么跑」。

### H1：未运行，缺 OPENAI_API_KEY / ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY

预期（有密钥后由 `pnpm eval` 填写真实字段）：第一次出现写入（Anthropic：`cache_creation_input_tokens > 0`；OpenAI：`cache_write_tokens > 0`，或第一次 `cached_tokens` 为 0 且第二次 `> 0`）；第二次出现命中（Anthropic：`cache_read_input_tokens` 接近第一次写入量，`input_tokens` 明显更小；OpenAI：`cached_tokens > 0`）。

当前没有模型 id、usage、估算成本或 TTFT。

### H2：未运行，缺 OPENAI_API_KEY / ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY

预期：同一套前缀，但缓存标记只放在带时间戳的问题上；两次主要是写入 / `cached_tokens` 接近 0，不能当成 H1 那样的命中。若提供商隐式断点造成部分命中，评测脚本会如实记录字段，不改数字。

### H3：未运行，缺 OPENAI_API_KEY / ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY

预期：用官方单价计算 H1 两次请求的输入成本，对比「两次都按未缓存输入价」的算术对照。有密钥跑通后，报告会写明对照是计算值。

### H4：未运行，缺 OPENAI_API_KEY / ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY

可选。评测脚本会记录 TTFT（`streamText` 到第一条文本增量的时间）。即使跑通，单次配对样本也应标「不确定」，不挑一次好看的结果当结论。

### H5：支持

不依赖计费，也不需要密钥。测试文件：`tests/h5-cache-control.test.ts`。方法：`createAnthropic({ apiKey: "test-key-not-a-secret", fetch })` 拦截即将发出的 JSON，并返回夹具响应，不访问 `api.anthropic.com`。

实测（`pnpm test`）断言如下。

1. `H5: message-level providerOptions.anthropic.cacheControl appears only on that message's last content part`

   一条 user 消息含三个 text part，只在消息级设置 `providerOptions.anthropic.cacheControl = { type: "ephemeral", ttl: "5m" }`。发出的 JSON：

   - 请求顶层没有 `cache_control`（未开启自动缓存）
   - `messages[0].content` 为三个 text 块
   - 前两个块没有 `cache_control`
   - 最后一个块为 `cache_control: { type: "ephemeral", ttl: "5m" }`

2. `H5: a part-level cacheControl mark takes precedence over the message-level mark on the same part`

   消息级为 `{ type: "ephemeral", ttl: "5m" }`，同时在最后一个 part 上设置 part 级 `{ type: "ephemeral", ttl: "1h" }`。发出的 JSON 里，最后一块是 `ttl: "1h"`，不是消息级的 `5m`。实现上来自 `@ai-sdk/anthropic` 的 `part.providerOptions ?? (isLastPart ? message.providerOptions : undefined)`。

3. `H5: a non-last part-level mark stays on that part, and message-level still lands on the last part`

   中间块带 part 级 `ttl: "1h"`，消息级仍是 `5m`。发出的 JSON 为：第一块无标记，第二块 `ttl: "1h"`，最后一块拿到消息级的 `ttl: "5m"`。也就是说「优先」指同一块上 part 级覆盖消息级；消息级不会抹掉其他块上的 part 级标记，仍会落到最后一个未单独标记的块上。

同文件之外，`tests/cost-usage.test.ts` 用官方文档中的夹具对象验证了 usage 解析与成本算术（包括 Anthropic 的 `cache_creation` 5m/1h 拆分，以及 OpenAI 文档中 `cached_tokens` + `cache_write_tokens_details` 的例子），不是实况评测结果。

## SDK 映射要点（对照 `ai@7.0.173` / 提供商包源码）

这些是读已安装 typings/source 后的观察，供有密钥时复现对照，不是实况 usage。

- Anthropic：`providerOptions.anthropic.cacheControl`（也接受 `cache_control`）写到对应 content 块的 `cache_control`。消息级标记只回退应用到**该消息最后一个** part。请求级 `providerOptions.anthropic.cacheControl` 会变成顶层 `cache_control`（自动缓存）。显式断点上限 4 个，多出的会被忽略并记 warning。
- Anthropic usage：官方字段是 `input_tokens`（断点之后、不计缓存的部分）、`cache_creation_input_tokens`、`cache_read_input_tokens`。SDK 映射为 `inputTokenDetails.{noCacheTokens,cacheWriteTokens,cacheReadTokens}`，并且 `inputTokens`（total）= 三者之和。TTL 拆分仍在 `usage.raw.cache_creation`。
- OpenAI：`createOpenAI()(modelId)` 在 4.0.118 默认创建 Responses 模型。`providerOptions.openai.promptCacheOptions` 映射为顶层 `prompt_cache_options`（`mode` / `ttl` / `prewarm` / `comparison_response_id`）。内容块上的 `providerOptions.openai.promptCacheBreakpoint`（`{ mode: "explicit", ttl?: "30m"|"12h" }`）映射为该块的 `prompt_cache_breakpoint`。system/developer 消息若带消息级 breakpoint，会被改写成带 `input_text` 块的数组；user 消息的 breakpoint 从 **part** 级 `providerOptions` 读取（H2 因此把标记放在 text part 上）。文档写明顶层 `instructions` 不能放显式断点。
- OpenAI usage：官方字段在 `usage.input_tokens_details.cached_tokens` 与 `cache_write_tokens`（以及 `cache_write_tokens_details.ttl_30m_tokens` / `ttl_12h_tokens`）。SDK 映射到同样的 `inputTokenDetails`。`input_tokens` 本身已是总量，普通输入 = `input_tokens - cached_tokens - cache_write_tokens`。
- 自动 / 隐式缓存：H1/H2 都不用 Anthropic 顶层自动缓存，OpenAI 用 `mode: "explicit"`，以便只检验我们放置的断点。隐式断点若仍出现，评测会如实留下字段。
- `temperature`：任务希望 0，但 `@ai-sdk/anthropic@4.0.105` 在 `claude-sonnet-5-5` 上会发出 warning（`temperature is not supported ... and will be ignored`）。评测请求因此不传 `temperature`，改用短问题和 OpenAI 的 `reasoningEffort: "low"` 控制输出长度。


## 怎么跑

本报告记录的环境：

- Node `v24.22.1`
- pnpm `10.34.6`
- 工作目录：`bot/2026-11-17-prompt-caching-cost/`

本环境实测退出码（2026-11-17，Asia/Shanghai）：

- `pnpm install`：0
- `pnpm test`：0（11 passed）
- `pnpm typecheck`：0
- `pnpm build`：0
- `pnpm eval`：1（无密钥，预期失败；打印了上面三条缺失变量，未写 `results.json`）

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev          # 浏览器打开说明页；无密钥时页面可用，评测按钮禁用
pnpm eval         # 无密钥时以非 0 退出，并打印缺少的变量名
```

需要的环境变量见 `.env.example`。不要把真实密钥提交进仓库。有密钥后，`pnpm eval` 会真实调用模型并写出 `results.json` 与 `results.md`（二者已被 gitignore）。然后用这些真实数字更新本报告的 H1–H4，不要把预算估算写成实测。

无密钥时 `pnpm eval` 的预期输出类似：

```text
未运行：当前环境缺少 OPENAI_API_KEY、ANTHROPIC_API_KEY、AI_GATEWAY_API_KEY。不要用 mock 冒充 usage。设置其中至少一个变量后重新运行 pnpm eval。
缺少的环境变量：OPENAI_API_KEY、ANTHROPIC_API_KEY、AI_GATEWAY_API_KEY
```

`pnpm test` 预期：全部通过，其中包括上述三条 H5 断言，以及成本/解析夹具测试。H1–H4 没有集成测试，因为没有密钥，也不能 mock usage 冒充命中。

## 未解决的问题

- H1–H4 尚未用真实 API 跑过。本环境没有可用密钥，且出口区域限制下直接访问 `api.openai.com` 也可能失败；有密钥后应在可访问对应 API 的环境重跑 `pnpm eval`，再用真实结果更新本报告。
- 默认 OpenAI 型号写成 `gpt-5.6-sol`（官方定价表中的 id）。若账号实际要用别的 GPT-5.6 别名，设置 `OPENAI_MODEL`。若定价表没有该 id，脚本会拒绝编造单价。
- Anthropic 文档里有一处 usage 示例 `input_tokens: 2048` 同时列出 `cache_read_input_tokens` / `cache_creation_input_tokens`，与后文「`input_tokens` 只表示最后一个断点之后的 token，总量为三者之和」的公式并置时容易读混。本 demo 按公式和 SDK 映射处理，并把原始 `usage.raw` 留在结果里。
- 预热默认未跑。启用后若第一次正式请求已经是命中，H1 的「第一次写入、第二次命中」叙述需要按真实字段改写。
