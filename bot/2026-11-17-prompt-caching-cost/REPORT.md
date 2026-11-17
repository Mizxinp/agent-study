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
- `lib/base-url.ts`：读取 `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL`（若未设则回退 `CR_OPENAI_BASE_URL` / `CR_ANTHROPIC_BASE_URL`），去掉尾部斜杠后传给 `createOpenAI` / `createAnthropic`。已核对 `@ai-sdk/openai@4.0.118` 会把 path 拼到 base 上（`/responses`、`/chat/completions`、`/embeddings`），`@ai-sdk/anthropic@4.0.105` 会拼 `/messages`，且只在 base 恰好为 `https://api.anthropic.com` 时自动补 `/v1`。因此自定义 base 必须已含 `/v1`，最终请求落到 `/v1/responses` 或 `/v1/messages`，不会出现重复的 `/v1`。自定义 Anthropic base 时额外带上 `Authorization: Bearer …`，与 SDK 默认的 `x-api-key`、`anthropic-version: 2023-06-01` 一起发送。
- `lib/call.ts`：`streamText` 增加 `allowSystemInMessages: true`。`ai@7.0.173` 默认禁止 `messages` 里的 system 角色；缓存断点写在稳定前缀这条 system 消息的 `providerOptions` 上，改用 `instructions` 会丢掉这些标记。
- 可选 `EVAL_SKIP_OPENAI=1`：当兼容接口不支持 Responses 时跳过 OpenAI 路径。本次 CR 的 `POST /v1/responses` 可用，未跳过。

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

本轮在共享云电脑上于 2026-11-18 00:40:45（Asia/Shanghai）跑通 `pnpm eval`（退出码 0，墙钟约 25 秒）。密钥只通过 `source` 注入进程环境，没有写入仓库 `.env`，也没有编造 usage。数字来自 `results.json` / `results.md` 中的真实 `usage`（含 `usage.raw`）。成本按官方单价估算，不是 CR 账单。OpenAI Responses 的 `usage.raw` 里还有一个 `cost` 字段，本报告不采用该字段作为账单。

实际模型与路径：

| 提供商 | 模型 id | 请求路径（SDK 拼接） | 断点方式 |
| --- | --- | --- | --- |
| Anthropic 兼容 | `claude-sonnet-5-5` | `{ANTHROPIC_BASE_URL}/messages` → `/v1/messages` | 块级 `cache_control`（非顶层自动缓存） |
| OpenAI 兼容 | `gpt-5.6-sol` | `{OPENAI_BASE_URL}/responses` → `/v1/responses` | Responses `prompt_cache_options.mode: "explicit"` + `prompt_cache_breakpoint` |

稳定前缀约 2156 tokens（8624 字符，chars/4 估算），未因过短而加长。预热默认关闭，本轮未启用。H3 对照是**算术对照**（把 H1 两次全部 input tokens 按未缓存输入单价计费），不是第三次关闭缓存的实测请求。

Anthropic usage 原始字段：`input_tokens`、`cache_creation_input_tokens`、`cache_read_input_tokens`、`cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens`、`output_tokens`。OpenAI Responses usage 原始字段：`input_tokens`、`input_tokens_details.cached_tokens`、`input_tokens_details.cache_write_tokens`（及 `cache_write_tokens_details.ttl_30m_tokens` / `ttl_12h_tokens`）、`output_tokens`、`total_tokens`。

样本很小（每个提供商 H1/H2 各两问、H4 仅一对 TTFT），结论只对这次运行有效。

### Anthropic / `claude-sonnet-5-5`

| 请求 | input | noCache | cacheWrite（5m） | cacheRead | output | 估算输入成本 USD | 总耗时 / TTFT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| H1-1（预期写入） | 3990 | 41 | 0 | 3949 | 5 | 4.769e-4 | 4714 / 4709 ms |
| H1-2（预期命中，换问题） | 3985 | 36 | 0 | 3949 | 5 | 4.669e-4 | 3825 / 3726 ms |
| H2-1（断点在变化问题上） | 4013 | 4 | 60 | 3949 | 5 | 5.529e-4 | 2812 / 2811 ms |
| H2-2（断点在变化问题上） | 4008 | 4 | 4004 | 0 | 5 | 1.0018e-2 | 3021 / 3020 ms |

- **H1：不确定。** 假设是第一次 `cache_creation_input_tokens > 0`、第二次出现接近写入量的 `cache_read_input_tokens`。实测两次都是 `cache_creation_input_tokens = 0`、`cache_read_input_tokens = 3949`（`usage.raw.input_tokens` 分别为 41 和 36）。第一次就已经是命中而不是写入。本轮没有预热；连通性探测只用了极短 prompt，不应写入这段手册前缀。更像兼容层或上游的隐式前缀缓存，不能当成「显式断点第一次写入、第二次命中」的干净证据。如实记录，不改数字。
- **H2：不确定。** 假设把断点只放在带时间戳的问题上时，不应出现类似 H1 的前缀命中。第一次仍是 write=60、read=3949；第二次是 write=4004（`ephemeral_5m_input_tokens=4004`）、read=0。两次模式不一致，可能有隐式断点或部分命中，不能支持或否定该假设。
- **H3：支持。** H1 两次输入成本 9.438e-4 USD，低于算术对照 1.595e-2 USD（差额 1.5006e-2 USD）。对照是按未缓存输入单价计算的，不是第三次实测关缓存请求。
- **H4：不确定。** 仅一对样本：TTFT 4709 ms → 3726 ms（第二次更快）。样本少，不把单次差异写成确定结论。

### OpenAI Responses / `gpt-5.6-sol`

CR 官方兼容说明以 Chat Completions 为主，但本次先实测了 Responses：`POST /v1/responses` 对 `gpt-5.6-sol` 返回 HTTP 200，完整评测按原 demo 的 Responses + `promptCacheOptions` 路径跑通，没有改走 Chat Completions，也没有 mock usage。

| 请求 | input | noCache | cacheWrite（30m） | cacheRead | output | 估算输入成本 USD | 总耗时 / TTFT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| H1-1（预期写入） | 2360 | 33 | 0 | 2327 | 6 | 1.0628e-3 | 2417 / 2126 ms |
| H1-2（预期命中，换问题） | 2356 | 29 | 2327 | 0 | 6 | 1.1751e-2 | 2340 / 2125 ms |
| H2-1（断点在变化问题上） | 2381 | 3 | 2378 | 0 | 6 | 1.1902e-2 | 2887 / 2725 ms |
| H2-2（断点在变化问题上） | 2377 | 3 | 2374 | 0 | 6 | 1.1882e-2 | 2209 / 1805 ms |

- **H1：不支持。** 假设仍是第一次写入、第二次命中。实测顺序相反：第一次 `cached_tokens=2327`、`cache_write_tokens=0`；第二次 `cache_write_tokens=2327`（`ttl_30m_tokens=2327`）、`cached_tokens=0`。前缀长度已高于 1024，不是因为过短。脚本判定为不支持；字段如实保留。
- **H2：支持。** 两次主要是写入、没有前缀命中（write=2378 / 2374，read=0），不像一次典型的稳定前缀命中。
- **H3：支持。** H1 两次输入成本 1.28138e-2 USD，低于算术对照 1.8864e-2 USD（差额 6.050e-3 USD）。第一次命中按缓存读单价计入后，算术对照仍能看到输入成本更低。对照同样不是第三次实测关缓存请求。
- **H4：不确定。** 仅一对样本：TTFT 2126 ms → 2125 ms，几乎没有差别，不能下结论。

### H5：支持

不依赖计费，也不需要密钥。测试文件：`tests/h5-cache-control.test.ts`。方法：`createAnthropic({ apiKey: "test-key-not-a-secret", fetch })` 拦截即将发出的 JSON，并返回夹具响应，不访问官方或兼容端点。

本轮 `pnpm test` 为 **16 passed**（原 11 条加上 base URL 拼接夹具）。H5 三条断言与首次提交时相同：

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

同文件之外，`tests/cost-usage.test.ts` 用官方文档中的夹具对象验证了 usage 解析与成本算术（包括 Anthropic 的 `cache_creation` 5m/1h 拆分，以及 OpenAI 文档中 `cached_tokens` + `cache_write_tokens_details` 的例子），不是实况评测结果。`tests/base-url.test.ts` 只用虚构主机验证 URL 拼接，不发起网络请求。

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

本环境实测退出码（2026-11-18，Asia/Shanghai）：

- `pnpm install`：0
- `pnpm test`：0（16 passed）
- `pnpm typecheck`：0
- `pnpm build`：0
- `pnpm eval`：0（真实调用 CR 兼容接口，写出 `results.json` 与 `results.md`，墙钟约 25 秒）

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev          # 浏览器打开说明页；无密钥时页面可用，评测按钮禁用
pnpm eval         # 无密钥时以非 0 退出，并打印缺少的变量名
```

需要的环境变量见 `.env.example`。可设置 `OPENAI_BASE_URL` / `ANTHROPIC_BASE_URL`（或 `CR_*` 别名），base 需已包含 `/v1`。不要把真实密钥提交进仓库。`pnpm eval` 会真实调用模型并写出 `results.json` 与 `results.md`（二者已被 gitignore）。本报告的 H1–H4 已按这次真实数字更新；成本是官方单价估算，不是账单。

无密钥时 `pnpm eval` 的预期输出类似：

```text
未运行：当前环境缺少 OPENAI_API_KEY、ANTHROPIC_API_KEY、AI_GATEWAY_API_KEY。不要用 mock 冒充 usage。设置其中至少一个变量后重新运行 pnpm eval。
缺少的环境变量：OPENAI_API_KEY、ANTHROPIC_API_KEY、AI_GATEWAY_API_KEY
```

`pnpm test` 预期：全部通过，其中包括上述三条 H5 断言，以及成本/解析夹具测试。H1–H4 没有集成测试，因为没有密钥，也不能 mock usage 冒充命中。

## 未解决的问题

- Anthropic 与 OpenAI 的 H1 第一次请求都已经出现大量 cache read、几乎没有 cache write，不符合「第一次写入、第二次命中」的典型顺序。可能是兼容层或上游的隐式前缀缓存，本轮无法分离。若要验证显式断点本身，需要可关闭隐式缓存的对照，或一次确定的冷缓存窗口；本次没有做第三次关缓存的实测。
- OpenAI H1 甚至是先命中、后写入，假设被判定为不支持。Responses 路径可用，但这次不能证明 explicit breakpoint 按预期工作。
- H4 只有一对 TTFT，结论保持不确定。
- 默认 OpenAI 型号仍是 `gpt-5.6-sol`（官方定价表中的 id）。若账号实际要用别的 GPT-5.6 别名，设置 `OPENAI_MODEL`。若定价表没有该 id，脚本会拒绝编造单价。
- Anthropic 文档里有一处 usage 示例 `input_tokens: 2048` 同时列出 `cache_read_input_tokens` / `cache_creation_input_tokens`，与后文「`input_tokens` 只表示最后一个断点之后的 token，总量为三者之和」的公式并置时容易读混。本 demo 按公式和 SDK 映射处理，并把原始 `usage.raw` 留在结果里。
- 预热默认未跑。本轮即使未预热，第一次正式请求也已经是命中，H1 叙述已按真实字段改写为不确定 / 不支持。
