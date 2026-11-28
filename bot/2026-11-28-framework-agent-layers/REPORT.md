# AI SDK 智能体三层差异实验

Next.js App Router 首页在构建时运行一次 ToolLoopAgent，并展示实测步数、停止原因和模型端 user-agent。Vitest 给两种 Agent 和裸文本 API 使用同一套脚本模型。脚本默认每步调用一次本地工具，也可在指定步返回普通文本。测试记录模型调用选项、完成的步数和警告，analyze 从记录生成结论。eve 作为第三层背景展示，实验范围是前两层。

## 运行

实测 Node `v24.22.1`、pnpm `10.34.6`。锁文件解析为 `ai@7.0.184`、`@ai-sdk/workflow@2.0.116`、`workflow@5.8.0`。Workflow DevKit 5.8.0 在本实验路径兼容，无需调整版本。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
```

预期 10 个测试通过，主项目类型检查通过，Next.js 预渲染 `/`，analyze 打印 H1–H7 的结论。首次安装需要 Registry 或已有 pnpm 缓存。安装后，测试、构建和分析使用本地模型、工具、系统字体和依赖。测试写入 [observations.json](results/observations.json)，分析生成 [summary.json](results/summary.json)。结果中的双元素数组按 generate、stream 顺序排列。

## 实测

| 假设 | 结论 | 关键观测 |
| --- | --- | --- |
| H1 · P0 | 支持 | ToolLoopAgent 的 generate 和完整消费后的 stream 均为 20 步。第 20 步仍请求工具时，两者各有一条默认上限警告。第 20 步返回普通文本的对照组也各走 20 步，警告均为空。 |
| H2 · P0 | 支持 | 裸 generateText 和完整消费后的 streamText 各完成 1 步，模型均请求了工具。 |
| H3 · P0 | 支持 | WorkflowAgent 在普通 Node/Vitest 中可调用。generate 默认完成 20 步并告警。stream 省略 stopWhen，逐步回调记录了第 20、21、22、23、24、25 步，第 25 步回调触发 AbortController，调用返回 25 步，无警告。prepareCall 观察到 generate 有 stopWhen，stream 没有。 |
| H4 · P0 | 支持 | ToolLoopAgent 可以传给 createAgentUIStreamResponse。相同位置传 WorkflowAgent 时 TypeScript 报 TS2741，缺少 Agent 所需的 version。 |
| H5 · P0 | 支持 | 在 mock 的 doGenerate/doStream 入口读取 options.headers。ToolLoopAgent generate 为 `ai-sdk-agent/tool-loop ai/7.0.184`，stream 为 `ai-sdk-agent/tool-loop`。WorkflowAgent 两个入口均为 `ai-sdk-agent/workflow`。这些是模型边界收到的值。 |
| H6 · P1 | 支持 | WorkflowAgent 声明工具 `alpha, beta`，默认按此顺序发给模型。构造时传入 `['beta', 'alpha']` 后，prepareCall 和模型均看到 `beta, alpha`。 |
| H7 · P1 | 支持 | ToolLoopAgent 接受 fixture 字符串并成功完成一步，Uint8Array 也通过编译。WorkflowAgent 接受 `{ environmentVariable: string }` 并成功构造，传字符串被 TypeScript 以 TS2322 拒绝。实验只验证接口形状，构造路径无需读取该环境变量。 |

### 警告全文

H1 的两种入口通过 `onWarning` 捕获到同一条消息。

```text
The tool loop stopped because it reached the default stopWhen condition, isStepCount(20). To allow more steps, set stopWhen to isStepCount(...) with a higher limit or provide a custom stop condition. Learn more: https://ai-sdk.dev/docs/agents/loop-control
```

H3 的 generate 通过 `process.emitWarning` 捕获两条消息，包括进程首次使用警告系统时的提示。

```text
AI SDK Warning System: To turn off warning logging, set the AI_SDK_LOG_WARNINGS global to false.
AI SDK Warning (fixture / offline-loop): The tool loop stopped because it reached the default stopWhen condition, isStepCount(20). To allow more steps, set stopWhen to isStepCount(...) with a higher limit or provide a custom stop condition. Learn more: https://ai-sdk.dev/docs/agents/loop-control
```

### TypeScript 诊断全文

Vitest 将正反例交给独立的 TypeScript 项目，断言只有两条预期错误。主项目的 `pnpm typecheck` 排除该诊断用例。

```text
tests/interfaces.negative.ts(13,31): error TS2741: Property 'version' is missing in type 'WorkflowAgent<ToolSet, Context, any, any>' but required in type 'Agent<never, {}, Context, never>'.
tests/interfaces.negative.ts(14,28): error TS2322: Type 'string' is not assignable to type 'WorkflowToolApprovalSecret'.
```

## 源码与文档对照

- H1、H5。ToolLoopAgent 为两种入口补上默认停步条件，并附加相同的 Agent user-agent 标记。默认停止函数只在循环本可继续时求值。 [默认设置](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/ai/src/agent/tool-loop-agent.ts#L148-L152) · [停步警告](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/ai/src/agent/default-stop-condition.ts#L19-L56) · [请求头](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/ai/src/agent/tool-loop-agent.ts#L200-L211)
- H2。两个底层入口各自默认 `isStepCount(1)`。 [generate-text.ts](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/ai/src/generate-text/generate-text.ts#L302) · [stream-text.ts](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/ai/src/generate-text/stream-text.ts#L490)
- H3、H4、H5。WorkflowAgent 只对 generate 补默认上限，循环结束后发警告。它拥有独立的类声明和 user-agent。 [类声明](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L1652-L1657) · [默认条件选择](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L1872-L1881) · [请求头](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L2509-L2515) · [循环结束后告警](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L3520-L3529)
- H6。官方差异表将 `toolOrder` 列为 ToolLoopAgent 专属。钉住的 WorkflowAgent 版本声明并保存此选项，模型端实测收到重排后的工具。 [官方差异表](https://ai-sdk.dev/docs/agents/workflow-agent#differences-from-toolloopagent) · [构造选项](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L594-L604) · [保存选项](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L1728-L1732) · [传入循环](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L2842-L2845)
- H7。ToolLoopAgent 声明原始值类型，WorkflowAgent 声明环境变量引用，并在签名相关代码中解析该引用。 [ToolLoopAgent 设置](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/ai/src/agent/tool-loop-agent-settings.ts#L160-L167) · [WorkflowAgent 引用类型](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L174-L183) · [引用解析](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L3851-L3862)
- Workflow 包实际导出 `createModelCallToUIChunkTransform`，与深挖笔记及官方示例一致。钉住源码的 writable JSDoc 另有一处写成 `createUIMessageChunkTransform`。脚本模型实际从 `ai/test` 导入 `MockLanguageModelV4`。 [Workflow 导出](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/index.ts#L41-L48) · [writable JSDoc](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L1354-L1375)

- 深挖笔记的 `prepareStep.messages` 对照把两者写反了。钉住版本中 WorkflowAgent 接收 `LanguageModelV4Prompt`，ToolLoopAgent 复用的核心回调接收 `ModelMessage[]`。这是源码对照项。 [Workflow 回调类型](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/workflow/src/workflow-agent.ts#L342-L346) · [AI SDK 核心回调类型](https://github.com/vercel/ai/blob/71aa4dd03a840c9a98bc7426402a96fb9fe147c2/packages/ai/src/generate-text/prepare-step.ts#L63-L69) · [官方回调对照](https://ai-sdk.dev/docs/agents/workflow-agent#differences-from-toolloopagent)

步数和工具顺序来自模型调用记录及循环结果。请求头证据止于模型入口，类型证据来自指定版本的 TypeScript。Workflow 调用在普通 Node 中执行，持久化、跨进程恢复、审批签名往返及真实模型路由质量均在实验范围之外。H6 和 H7 的约定范围都已验证。
