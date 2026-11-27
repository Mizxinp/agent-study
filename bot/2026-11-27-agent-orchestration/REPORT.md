# 德化陶瓷店客服 Agent 编排实验

## 做了什么

用固定的订单、退款、商品夹具比较代码路由、handoff 和 agent-as-tool，验证 OpenAI Agents SDK 的转接和跨进程审批恢复、AI SDK 的审批历史与子 agent 循环，以及 Next.js 的服务端审批消费。退款工具只向本地 `.data/` 下的 JSONL 账本追加记录。

- `lib/` 提供固定 agent 图、账本、两套 SDK 的实验和路由实现。
- `tests/` 按 H1–H10 各设一个 Vitest 文件。`scripts/resume-child.ts` 在全新 Node 进程恢复 H6 的快照。
- `scripts/analyze.ts` 运行同一组实验，按实测判据生成结论，打印表格并写入 `results/summary.json` 和 `results/trace.sample.json`。App Router 首页展示结果，两个 POST 路由用于 H10。

## 结果怎么样

P0 覆盖 H1–H6、H8、H9a、H9b。P1 覆盖 H7、H9c、H9d、H10，全部完成。表中的结论摘自本次 `pnpm analyze` 生成的 [summary.json](results/summary.json)。任务书只要求观察的条目标为「记录」。

| 子项 | 结论 | 实测 |
| --- | --- | --- |
| H1a | 支持 | `request.handoffs` 含退款转接，严格 schema 为空对象且 `additionalProperties: false`。`request.tools` 无该项，判据要求 `alsoTool: false`。 |
| H1b | 支持 | Refund 收到自己的指令和 3 项输入（用户消息、转接调用、结果），结果文本为 `{"assistant":"Refund agent"}`。 |
| H1c | 支持 | 模型共调用 2 次，Runner 触发 1 次 `agent_handoff`，`lastAgent` 与 `activeAgent` 为同一个 Refund，终答「请问您要退哪件陶瓷？」。 |
| H1d | 记录 | 同名函数工具构造和运行均未报错，函数执行 0 次，转接至 Refund。 |
| H2a | 支持 | 先查订单 1 次。转接前有 reasoning、调用和结果。过滤后只剩 1 条用户消息。 |
| H2b | 支持 | 恰好 2 项，最后一条用户消息和摘要。 |
| H2c | 支持 | 两个续接 ID 分别触发同一条 `UserError`，Refund 各调用 0 次。 |
| H3 | 支持 | 只转 Refund，Product 0 次，转接调用项 1 个，历史无第二项，未捕获 `console.warn`。 |
| H4a | 支持 | 中断 1 个，停在 Triage，退款模型和订单工具均为 0 次。 |
| H4b | 支持 | 恢复后查订单 1 次，转到 Refund。Triage 累计 1 次，Refund 1 次。 |
| H4c | 记录 | 拒绝后查订单 0 次，仍转 Refund，Refund 看到「店长未批准」。 |
| H5a | 支持 | 代码路由 3 次、handoff 3 次、as-tool 4 次。 |
| H5b | 支持 | 第二轮从 Triage 重新进入 3 次，从上轮 `activeAgent` 开始 2 次，as-tool 4 次。 |
| H5c | 支持 | 3 个延迟 100 ms 的子 agent 并发，总耗时 104 ms，共 5 次模型调用。三个 handoff 仅转一个，共 2 次模型调用，另两专家均为 0。 |
| H5d | 支持 | 子 agent 输入 67 个 JSON 字符，只含工具传入的任务。handoff 输入 829 个字符，包含两轮历史。 |
| H6a | 支持 | 中断 1 个，Refund 的 `issue_refund`，callId 同工具名，参数为 ORD-1001 和 100，账本 0 行。 |
| H6b | 不支持 | 快照写出 `1.23`，7817 字节。预注册期望 `1.24`。 |
| H6c | 支持 | 子进程退出 0，恢复阶段 Manager、Refund 各调用 1 次，两进程合计各 2 次，账本 1 行，最终无中断。 |
| H6d | 不支持 | 更名图反序列化后，原属 `Refund agent` 的 1 个中断转到 `Manager agent` 名下。批准并继续运行后，退款被静默丢弃。Refund 模型调用 0 次，账本 0 行，剩余中断 0 个，无所属 agent。未抛错，脚本 Manager 仍输出「退款流程已结束」。预注册期望显式报错。 |
| H6e | 支持 | 拒绝后账本 0 行，子模型看到了「店长未批准退款」。 |
| H6f | 支持 | 同一服务端测试快照批准并恢复两次，账本 2 行。 |
| H7a | SDK 检出 | 仅待审批项参数变化，无异常、无剩余中断、工具未执行、账本 0 行。 |
| H7b | 未检出 | 参数一致性用例无异常，工具执行 1 次，账本金额 9999。 |
| H7c | SDK 检出 | `UserError`，工具未执行、账本 0 行。 |
| H8a | 支持 | 1 条审批请求，`stoppedBy=approval`，账本 0 行。 |
| H8b | 支持 | 批准历史恢复后账本 1 行。 |
| H8c，无签名 | 记录 | 无异常，工具使用历史中变更后的金额 9999，账本 1 行。 |
| H8c，有签名 | 支持 | `InvalidToolApprovalSignatureError`，账本 0 行。 |
| H8d | 支持 | 同一批准历史再次提交，账本增至 2 行。 |
| H9a | 支持 | 子 3 步、父 2 步、共 5 次调用。父 prompt 有摘要且无子工具细节。使用提取函数的 prompt 为 313 字符，对照为 1174 字符，包含子工具细节。 |
| H9b，默认 | 支持 | 20 步，`stop-condition / tool-calls`，捕获默认步数上限告警。 |
| H9b，自定义上限 | 支持 | 3 步，`stop-condition / tool-calls`。 |
| H9b，自然结束 | 支持 | 1 步，`model / stop`。 |
| H9b，待审批 | 支持 | 1 步，`approval / tool-calls`。 |
| H9b，无 execute | 支持 | 1 步，`tool-without-execute / tool-calls`。 |
| H9c | 记录 | 子调用正常返回 `stoppedBy=approval` 和 1 条审批请求。父模型调用 2 次，只看到工具返回的空文本，父级继续结束。 |
| H9d | 支持 | 转发父信号时子模型启动 1 次、完成 0 步，父子均抛 `DOMException`。不转发时父抛同样的异常，子模型完成 3 步。 |
| H10.chat | 支持 | 200，返回 `runId` 与 1 条 `approvals`，账本 0 行。 |
| H10.identity | 支持 | 非所有者 403，即使 body 写入所有者。无关 decisionId 为 404。 |
| H10.approve | 支持 | 客户端夹带 SDK 生成的快照，本地 `RunState.fromString` 解析成功，恢复 1 个金额为 9999 的 `issue_refund` 待审批项。服务端忽略夹带的快照，批准后返回「退款已批准」，账本仅 1 行，金额 100。 |
| H10.replay | 支持 | 并发两次响应 200 和 409，之后重复请求 409，账本仍 1 行。 |
| H10.reject | 支持 | 200，返回「退款未批准」，账本仍 1 行。 |
| H10.build | 支持 | Next 构建退出 0。 |

关键错误全文（随机审批 ID 用占位符表示，实际值见 JSON）：

- H2c 两个分支均为 `UserError`。Handoff input filters cannot be used with conversationId or previousResponseId because server-managed history cannot be filtered locally. Use explicit client-managed history or a Session without either continuation option.
- H7c 为 `UserError`。RunState contains a per-call function approval without its canonical invocation binding.
- H8c 为 `InvalidToolApprovalSignatureError`。Tool approval signature verification failed for approval "<approvalId>" (tool call "issue_refund"): invalid signature
- H9d 的 `DOMException` 文案为 `This operation was aborted`。

## 怎么跑起来

在本目录使用 Node.js v24.22.1 和 pnpm 10.34.6。首次依赖获取可使用 registry，已有本地依赖缓存时可离线安装。测试、构建和分析使用本地模型替身和资源。

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
```

预期安装锁文件解析的精确版本，Vitest 通过 10 个文件，类型检查退出 0，Next 产出静态首页和两个动态 POST 路由。分析打印实验表并更新两个 JSON 文件，其中 H10 的构建观测会再执行一次本地构建。

## 与源码笔记及文档对照

OpenAI Agents JS 固定在 `8aeac0eb255dbdff9adcdc65a0eae638cbcea74f`，下表路径相对于 `packages/agents-core/src/`。AI SDK 固定在 `0411a13df36b20bf6c67c82c1056e99d0e48257b`，下表使用仓库路径。

| 实验 | 固定源码位置 | 对照 |
| --- | --- | --- |
| H1 | OpenAI `handoff.ts:77–96,463–476`，`runner/modelOutputs.ts:255–278`，`runner/toolExecution.ts:2873–2900` | 名称/schema、调用分类、转接事件和历史。 |
| H2 | OpenAI `extensions/handoffFilters.ts:38–71`，`runner/toolExecution.ts:2876–2900`，`runner/turnResolution.ts:1829–1843` | 默认移除的项目和续接 ID 限制。 |
| H3 | OpenAI `runner/modelOutputs.ts:255–278`，`runner/toolExecution.ts:2777–2791,2852–2860` | 首个转接进入历史，额外转接标记在 span 上。 |
| H4 | OpenAI `runner/turnResolution.ts:1845–1914`，`runner/runLoop.ts:329–405` | 审批先于转接，恢复重用已接受的响应。 |
| H5 | OpenAI `agent.ts:753–761,830–853,878–911`，`runner/toolExecution.ts:2777–2791` | 生成的子任务输入与嵌套 Runner，handoff 仅执行一个。代码路由的分类与 switch 属于夹具。 |
| H6 | OpenAI `runner/toolExecution.ts:1386–1399,2930–2960`，`agent.ts:912–941`，`runState.ts:201–230,3680–3715,3725–3787` | 子级审批汇总、从嵌套快照恢复与兼容序列化。 |
| H7 | OpenAI `runState.ts:964–996,3750–3787`，`runner/toolExecution.ts:1006–1041` | 快照格式和调用绑定检查。 |
| H8 | AI SDK `packages/ai/src/generate-text/collect-tool-approvals.ts:20–95`，`generate-text.ts:827–853`，`validate-tool-approvals.ts:67–114`，`tool-approval-signature.ts:61–105`（后三个均在同目录） | 从历史关联审批，支持可选的 HMAC 校验。 |
| H9 | AI SDK `packages/ai/src/agent/tool-loop-agent.ts:217–245`，`packages/ai/src/prompt/create-tool-model-output.ts:23–29`，`packages/ai/src/generate-text/generate-text.ts:1024–1056`，`packages/ai/src/generate-text/stopped-by.ts:16–42`，`content/docs/03-agents/06-subagents.mdx:335–349` | 提取工具输出、循环停止原因、子调用取消参数，以及文档所说的外层审批边界。 |
| H10 | OpenAI `runState.ts:3358–3392,3725–3787` | SDK 用于恢复与记录批准决策。服务端持有、用户绑定和 rename 消费由 Next.js 应用实现，对应 HITL 文档「Keep approval state on the server」。 |

## 实际 API 与偏离

- `@openai/agents-core/testing` 实际使用 `ScriptedModel`、类型 `ScriptedModelInput`、`functionCall(name, args, { callId })`、`assistantMessage(text)`、`modelResponse(items)`、`modelResponder(fn)`、`calls[i].request` 和 `enqueue(...steps)`。包也提供 `assertComplete()`，本实验用请求和次数断言核对路径。快照中的 handoff 对象字段是 `toolName`、`strictJsonSchema`、`inputJsonSchema`。任务书的 `strict` 是对 schema 约束的描述。发布包对 `Refund agent` 生成的默认名称是 `transfer_to_Refund_agent`，测试图用 `toolNameOverride` 固定为任务书中的 `transfer_to_refund_agent`。过滤器来自 `@openai/agents-core/extensions`。
- AI SDK 使用 `ai/test` 的 `MockLanguageModelV4`。原始 mock tool call 的 `input` 是 JSON 字符串，写入 `ModelMessage` 历史时是已解析对象。复用 `result.responseMessages` 里的 assistant `tool-call` 和 `tool-approval-request`，随后追加 `{ role: 'tool', content: [{ type: 'tool-approval-response', approvalId, approved: true }] }`。签名条目随 SDK 生成的审批历史保存。应用通过 `generateText` 的 `toolApproval` 与 `experimental_toolApprovalSecret` 配置校验，实验使用公开的固定测试值。
- H6b 的发布包和固定源码均声明 `CURRENT_SCHEMA_VERSION='1.24'`，但兼容分支会把满足条件的快照写为 `1.23`。H6d 仅改变 Refund 名称，观测到工具未执行但没有显式异常。脚本终答是固定文本，无法作为退款确实发生的证据。
- H9c 的内层 `generate` 返回待审批结果。其父工具只返回 `result.text`，审批请求没有向父循环传播，符合文档描述的子 agent 审批边界。
- H10 用请求头模拟身份。原子 rename 提供该进程文件系统下的单次消费，消费完成到工具执行之间的进程崩溃恢复未验证。H10 是应用层写法示例。

## 证据强度

脚本化模型只验证 SDK 机制，不验证真实 LLM 是否会选这些路径。H5 耗时来自同机 `Date.now()`，只表示量级。两套 SDK 都用本地模型替身，OpenAI tracing 用 `setTracingDisabled(true)` 和 `OPENAI_AGENTS_DISABLE_TRACING=1` 关闭。实验无需 API key，无需配置 .env。流式路径与服务端托管会话未做离线实测，H2c 只覆盖续接参数与过滤器的本地互斥校验。

H7 是对自有离线夹具的序列化行为记录。「SDK 检出」以工具拒绝执行或未使用改变的值为观测口径，允许静默跳过。SDK 文档声明快照不被认证，这些结果不构成安全评估。
