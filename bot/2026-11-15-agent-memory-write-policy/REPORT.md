# Agent 记忆写入策略对比实验

## 本次状态

本次环境无任何模型 API key，未运行评测，没有结果数字；H1–H4 均为“不确定（未运行）”。没有 results.json / results.md。构建和单元测试不代表模型效果验证。

## 实现

- add-only：每会话一次 Zod 结构化抽取，以 SHA-256 规范化内容去重，只追加，不合并同一槽位的冲突。
- crud：同样抽取；每候选检索 top-5，向模型显示从 1 开始的短整数 id，强制 decide 工具调用选择 ADD / UPDATE / DELETE / NOOP，再映射回内部 id。UPDATE 覆盖旧内容和时间，DELETE 真正移除旧值。
- full-context：不写记忆，直接提供完整对话。两种记忆各有显示 / 隐藏 created_at 的答题版本，共五配置。每轮实验为每种策略重新建库，时间版本共享同一库以减少写入差异。
- 有 embedding 时余弦检索 top-8；无时间打分项。仅 Anthropic key 时降级中文单字分词 BM25-only，并记录模型元数据。BM25 不需要 embedding，不能等同向量检索结果。
- 答题与抽取共用便宜模型，judge 默认另一档模型。选择优先级 OPENAI_API_KEY → ANTHROPIC_API_KEY → AI_GATEWAY_API_KEY。模型名可覆盖，覆盖时应保证 judge 来自另一档或另一供应商（直连模式只支持该供应商的模型名；跨供应商请使用 gateway 的 provider/model 名）。默认 OpenAI 为 gpt-4o-mini / gpt-4o，embedding 为 text-embedding-3-small；模型可用性取决于账户与供应商，必要时覆盖。
- 聊天页使用 useChat、DefaultChatTransport 和流式 Route Handler，每次回复后写入本轮；右侧轮询展示事件。浏览器随机 id 和策略隔离存储。聊天使用真实时间，评测使用数据集模拟时间。

接口以已安装 AI SDK 7 的 node_modules 类型核对。OpenAI 模型资料参考 [官方模型文档](https://developers.openai.com/api/docs/models/gpt-4o-mini)。

## 数据集

固定 seed=20261115，使用局部 Mulberry32 PRNG 选择槽位值、纠正槽位、表述和填充话题；每次生成重新初始化，scripts/gen-dataset.ts 输出 data/ 下四个 JSON。初始确认、带旧值或不带旧值的纠正、临时调整与恢复、朋友订单干扰均有多种中文表述。闲聊覆盖样品、开模、釉面瑕疵、付款方式、底足、色差、破损凭证等，客服回复随话题或订单确认变化，不从闲聊新增客户订单事实。

每客户保留十个槽位：发货城市、釉色、数量、单价预算、发票抬头、交期、Logo 工艺、包装、器型、物流。随机选择五或六个槽位各纠正一至两次，每客户恰好一个槽位临时修改后恢复初值，其他二次纠正不回退。三个朋友订单值均与本人对应槽位的整条时间线分离。

| 客户 | 会话数 | 消息数 | 纠正槽位数 | 时间线事件数（含初值） |
|---|---:|---:|---:|---:|
| customer-1 | 3 | 82 | 5 | 16 |
| customer-2 | 4 | 84 | 6 | 19 |
| customer-3 | 5 | 92 | 5 | 19 |
| customer-4 | 3 | 76 | 6 | 22 |

每客户恰好十五题：八道当前值题覆盖全部纠正槽位，再从未纠正槽位补足；四道历史题仅针对纠正槽位，两道问初值，两道问完整变化顺序，包含恢复初值的槽位；三道朋友订单干扰题。共六十题。gold、当前题 old（全部不同于最终值的历史值）及 avoid 均从结构化时间线计算。恢复初值后，中间临时值仍计入 old，初值本身不计入。问答发生在全部会话写入结束后。

Vitest 检查会话与消息范围、十槽位、五至六个纠正槽位、每槽位一至两次纠正、唯一回退、三个干扰值、8/4/3 题型数量、gold/old 与时间线一致及生成内容逐字节等于仓库中的 JSON。两次生成也进行文件差异比较。

## 指标与判分

当前值优先 NFKC 规范化字符串别名匹配，包含过期值则标为 stale。历史题用独立 judge 判定初始值，或变化题的顺序、完整性及回退。提及朋友值的答案交给 judge 区分“拒绝朋友值”和“误归给客户”。记录按题型准确率、当前题 stale-error rate、干扰题 distractor-error rate、真实 answer usage.inputTokens、本地全输入及资料 token 估算、写入模型调用数、embedding 调用数、每会话墙钟延迟和最终记忆数。

默认 RUNS=3；准确率等先按 run 聚合，再输出总体标准差的 mean ± std；写入指标按会话汇总。JSON 保留逐题答案、写入事件、调用计数、模型名与检索模式。inputTokens 是整次答题输入（包含提示），并不是单独资料的精确计数；资料单独给本地估算。失败时终止，不把部分结果当成功结果。重试关闭，温度为 0；模型端仍可能不确定。固定 seed 约束数据生成，不保证远端模型推理完全确定。

## 运行

环境：Node v24.22.1、pnpm 10.34.6。安装版本：Next.js 16.4.6、ai 7.0.173、@ai-sdk/react 4.0.177、@ai-sdk/openai 4.0.118、@ai-sdk/anthropic 4.0.105。pnpm-lock.yaml 固定依赖。

```sh
pnpm install
pnpm gen:data
pnpm format
pnpm test
pnpm typecheck
pnpm build
pnpm dev
pnpm eval
```

推荐在 shell 安全设置 OPENAI_API_KEY（不要把密钥写进代码或终端输出）；也可设置 ANTHROPIC_API_KEY 并接受 BM25 降级，或同时提供 embedding key；也可设置 AI_GATEWAY_API_KEY。可选 ANSWER_MODEL、JUDGE_MODEL、EMBEDDING_MODEL、RUNS。Next 会读取本地 .env.local；命令行评测使用 shell 环境变量，也可用 `pnpm exec tsx --env-file=.env.local scripts/eval.ts` 显式加载。示例文件只有变量名和空值。

缺少所有 key 时 pnpm eval 明确列出所需变量并非零退出，不创建结果文件。需要有效 key、模型访问权限、配额及 embedding 供应商后才能验证 H1–H4。仅 Anthropic 时允许 BM25-only；若要向量检索，需要 OPENAI_API_KEY 或 AI_GATEWAY_API_KEY。两个 key 同时存在会按上述优先级选答题供应商。

成功评测输出项目根目录 results.json 和 results.md。以下只说明格式，**不是实际数据或实验结果**：

```text
results.json:
  models: { provider, answerId, extractionId, judgeId, embeddingId, retrieval }
  summaries: { config: { metric: { mean: <实测均值>, std: <实测标准差> } } }
  writeSummaries: { strategy: { metric: { mean, std } } }
  rows: [{ run, dialogue, config, question, correct, stale, distractor, ... }]
  writes: [{ run, dialogue, strategy, session, events, llmCalls, latencyMs, ... }]
results.md:
  配置 | 指标 | mean ± std
  <配置名> | <指标名> | <实测均值> ± <实测标准差>
```

## 时间与费用预算（估算，不是实测）

每 run：四客户共十五会话，两种策略分别抽取，共三十次抽取调用；时间线共七十六个事实事件，若模型每事件提取一条事实，CRUD 决策预算约七十六次（重复事实可被本地去重跳过）。五配置 × 四客户 × 十五题 = 三百次答题，其中八十道历史答案必需 judge；其他答案若提及朋友值也会触发 judge，因此 judge 为八十至三百次 / run。按七十六次 CRUD 决策的预算，每 run 约 486–706 次语言模型调用，默认三 run 约 1458–2118 次。实际抽取候选数、去重和判分分支由模型输出决定，上述不是实测调用数。

有 embedding 时，每 run 四个记忆配置 × 六十题约二百四十次答题检索 embedding，另有写入向量和 CRUD 候选检索，按事实事件预算总计约四百至五百次 embedding 请求 / run；BM25-only 为零。最终实际调用数以评测输出为准。

假设每次串行请求耗时 0.5–3 秒，三 run 的语言模型请求约 12–106 分钟，计入 embedding 后预留约 20–180 分钟；网络、限流及候选数量可能扩大区间。预算单价假设：便宜模型输入 $0.15 / 百万 token、输出 $0.60 / 百万，judge 输入 $2.50 / 百万、输出 $10 / 百万，embedding $0.02 / 百万输入 token。假设普通调用平均输入 2000 / 输出 150 token，judge 平均输入 800 / 输出 50 token：三 run 普通调用约 1218 次，费用约 $0.48；judge 约 240–900 次，费用约 $0.60–2.25；合计约 $1.08–2.73，再考虑 embedding、长上下文及路由差异，预留约 $1–4。这些均为显式假定的预算，不是当前报价或实验结果，实际费用按 token 与账户账单计算。

## 限制与解释

这是策略受控 demo，不是 mem0 逐行复刻。四个合成客户虽有多种表述与批发话题，仍由有限模板生成，没有真实用户分布；需要更多样真实脱敏对话后才可泛化。当前字符串判分对否定旧值、数字近似和别名覆盖存在局限；stale 指标记录旧值出现，可能把否定提及计为旧值错误。judge 也可能误判，不应视为人工标注真值。抽取错误、检索召回、生成错误均影响最终结果。

CRUD 删除历史可能伤害变化题；追加库也可能因 top-8 丢失历史。时间戳只改变答题上下文，不改变检索。比较时间版本可探索 H2，但“显著”需要配对检验及更大样本；本实现报告描述性 mean ± std，不自动给出因果或显著性结论。H4 需同时观察输入 token 与正确率，完整对话没有自动截断：超过模型窗口会报错，不静默改成摘要。

聊天状态仅进程内存，无身份认证、持久化或容量治理，不适用于公开多租户部署。切换策略不复制旧策略记忆。流式答复结束后写入仍可能失败，页面会展示错误。评测逐会话、配置、问题打印进度；错误仅输出类名和 message，清除 sk- 模式、三个 key 环境变量的值及 headers 字段，不打印 provider 原始对象或堆栈。

## 本次本地验证

pnpm install、两次 pnpm gen:data（两次 data/ 文件差异为空）、pnpm test、pnpm typecheck、pnpm build 均通过。无 key 的 pnpm eval 非零退出，明确提示缺失的环境变量，未创建结果文件；开发服务 GET / 返回 200，POST /api/chat 返回明确的 503 JSON，验证后停止服务。未提交或推送。

阻塞仍在：无 key，模型评测未运行；H1–H4 不确定（未运行），没有效果指标数字。以上数据规模及费用预算不代表模型效果验证。
