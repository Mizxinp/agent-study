# MCP Tasks 与 Events 晚课实验

## 做了什么

用两个 Next.js 实例重现 MuseDAM 导出任务与德化陶瓷店订单事件。手写 JSON-RPC 服务端实现 2026-07-28 头部镜像、Tasks 状态查询和 Events 投递。Tasks 实验用原始 fetch，Events 用 AI SDK webhook 客户端。所有订单和模型输出都是本地夹具。

| 目录 | 内容 |
| --- | --- |
| `app/` | MCP 路由、AI SDK webhook 接收端和静态结果首页 |
| `lib/` | Tasks worker、事件发布与订阅、文件存储、Mock agent |
| `tests/` | Vitest 采样、端口检查、构建与实例起停 |
| `scripts/` | 三轮实验编排与结果分析 |
| `results/` | 提交的摘要和 wire log 样本。完整 wire log 和原始响应由测试生成 |

## 结果怎么样

下面的表格由 `pnpm analyze` 根据原始响应和两个实例的日志生成。H1 验证逐请求能力协商，H2 验证任务跨实例读取与终态，H3 验证 AI SDK 遇到异步结果时的处理和同步工具路径，H4 验证 Events 客户端能力检查、签名、竞态、重复投递与 Mock agent 唤醒。

<!-- analyze:start -->

| 子项 | 结论 | 实测 |
| --- | --- | --- |
| H1a | 支持 | `{"sync":{"resultType":"complete","content":[{"type":"text","text":"{\"exported\":3}"}],"isError":false},"syncResponse":{"port":3201,"http":200,"resultType":"complete"},"rejected":{"port":3201,"http":200,"rpcError":-32021},"requiredCapabilities":{"extensions":{"io.modelcontextprotocol/tasks":{}}}}` |
| H1b | 支持 | `{"port":3201,"http":200,"resultType":"task","handle":{"resultType":"task","taskId":"71f2e03d-02cf-41f1-8efe-1ea5cca45db2","status":"working","ttlMs":60000,"pollIntervalMs":200}}` |
| H1c | 支持 | `{"declared":{"port":3201,"http":200,"resultType":"task"},"omitted":{"port":3201,"http":200,"rpcError":-32021}}` |
| H2a | 支持 | `{"first":{"port":3202,"http":200,"resultType":"complete"},"ports":[3202,3201,3202,3201,3202,3201,3202,3201,3202,3201,3202],"polls":11,"elapsedMs":2099,"status":"completed","result":{"resultType":"complete","content":[{"type":"text","text":"{\"exported\":20}"}],"isError":false}}` |
| H2b | 支持 | `{"replies":[{"port":3201,"http":400,"rpcError":-32020},{"port":3201,"http":400,"rpcError":-32020}]}` |
| H2c | 支持 | `{"tool":{"polls":8,"elapsedMs":1452,"status":"completed","result":{"resultType":"complete","content":[{"type":"text","text":"{\"exported\":13}"}],"isError":true}},"internal":{"polls":3,"elapsedMs":415,"status":"failed","error":{"code":-32603,"message":"Fixture worker error"}}}` |
| H2d | 支持 | `{"earlyAck":{"resultType":"complete"},"early":{"polls":2,"elapsedMs":207,"status":"cancelled"},"lateAck":{"resultType":"complete"},"late":{"polls":1,"elapsedMs":4,"status":"completed","result":{"resultType":"complete","content":[{"type":"text","text":"{\"exported\":2}"}],"isError":false}}}` |
| H2e | 支持 | `{"replies":[{"port":3201,"http":200,"rpcError":-32602},{"port":3201,"http":200,"rpcError":-32601}]}` |
| H2f | 支持 | `{"owner":{"port":3201,"http":200,"resultType":"complete"},"other":{"port":3202,"http":200,"rpcError":-32602}}` |
| H3a | 支持 | `{"wire":{"at":1795698943451,"port":"3201","kind":"rpc","headers":{"version":"2026-07-28","method":"tools/call","name":"export_assets"},"eventsCap":"extensions","taskStore":"file","method":"tools/call","id":1,"name":"export_assets","extensions":[],"bodyVersion":"2026-07-28","status":200,"errorCode":-32021},"error":{"name":"MCPClientError","message":"Tasks capability required"}}` |
| H3b | 支持 | `{"wire":{"at":1795698943462,"port":"3201","kind":"rpc","headers":{"version":"2026-07-28","method":"tools/call","name":"export_assets"},"eventsCap":"extensions","taskStore":"file","method":"tools/call","id":1,"name":"export_assets","extensions":["io.modelcontextprotocol/tasks"],"bodyVersion":"2026-07-28","status":200,"resultType":"task"},"error":{"name":"MCPClientError","message":"Failed to process server response"}}` |
| H3c | 支持 | `{"steps":2,"text":"处理完成","toolResults":[{"type":"tool-result","toolCallId":"fixture-call","toolName":"export_assets","input":{"count":3},"output":{"resultType":"complete","content":[{"type":"text","text":"{\"exported\":3}"}],"isError":false},"dynamic":true,"toolMetadata":{"clientName":"ai-sdk-mcp-client","toolName":"export_assets"}}]}` |
| H4a | 支持 | `{"modes":[{"mode":"none","count":0,"error":{"name":"MCPClientError","message":"Server does not support events"}},{"mode":"legacy","count":1,"events":2},{"mode":"extensions","count":4,"events":2}]}` |
| H4b | 支持 | `{"stock":{"error":{"name":"MCPClientError","message":"MCP event stock.low does not support webhook delivery"}},"mode":{"error":{"name":"MCPClientError","message":"Only webhook event delivery is supported"}},"hostname":{"error":{"name":"MCPClientError","message":"MCP event callback URLs must use HTTPS without credentials or fragments"}}}` |
| H4c | 支持 | `{"verification":true,"order":true,"store":["pending","active"],"cursor":["0","1"],"statuses":[204],"onEvent":1,"data":{"orderId":"DH-c5a0ad15-67e2-4c14-b8a4-60c56f1771d8","shopId":"dehua-01","amount":128}}` |
| H4d | 支持 | `{"statuses":[401,401,401],"onEvent":0}` |
| H4e | 支持 | `{"statuses":[503,204],"onEvent":1,"retryMs":216,"cursor":["1","2"]}` |
| H4f | 支持 | `{"statuses":[204,204],"onEvent":2,"business":1,"webhookId":"35c35d288802fd05d4ddc51d5391b413259d3f26530497a18facb87838e34d95.6297234c-33c0-4314-bfed-35b065861b37"}` |
| H4g | 支持 | `{"payloadFields":["orderId","shopId","amount"],"agent":{"steps":2,"text":"处理完成","toolResults":[{"type":"tool-result","toolCallId":"fixture-call","toolName":"get_order","input":{"orderId":"DH-c5a0ad15-67e2-4c14-b8a4-60c56f1771d8"},"output":{"resultType":"complete","content":[{"type":"text","text":"{\"orderId\":\"DH-c5a0ad15-67e2-4c14-b8a4-60c56f1771d8\",\"state\":\"paid\",\"amount\":128,\"port\":\"3201\"}"}],"isError":false},"dynamic":true,"toolMetadata":{"clientName":"ai-sdk-mcp-client","toolName":"get_order"}}]}}` |
| H4h | 支持 | `{"status":410,"expiry":"2026-11-26T13:15:42.874Z","onEvent":0}` |

<!-- analyze:end -->

同一轮采样的 wire log 片段如下，完整截取见 [wire-log.sample.jsonl](results/wire-log.sample.jsonl)。

<!-- wire:start -->

```jsonl
{"port":"3201","kind":"rpc","method":"tools/call","name":"export_assets","extensions":[],"status":200,"errorCode":-32021}
{"port":"3201","kind":"rpc","method":"tools/call","name":"export_assets","extensions":["io.modelcontextprotocol/tasks"],"status":200,"resultType":"task"}
{"port":"3201","kind":"verification","matched":true}
{"port":"3201","kind":"delivery","status":503,"messageId":"722c2b56c0c83962377984d8c2e70b8c23ad8a896fec29ab040be9d87e783efd.76234ad5-00b8-45bc-ae4b-119b8a2b5347"}
{"port":"3201","kind":"delivery","status":204,"messageId":"722c2b56c0c83962377984d8c2e70b8c23ad8a896fec29ab040be9d87e783efd.76234ad5-00b8-45bc-ae4b-119b8a2b5347"}
```

<!-- wire:end -->

## 怎么跑起来

实测 Node.js `24.22.1`、pnpm `10.34.6`。测试在首次 globalSetup 构建 Next.js，再依次以 `extensions/file`、`legacy/file`、`none/memory` 启动两实例。每轮结束会关闭两个进程。3201 和 3202 都绑定在 127.0.0.1。若任一端口在用，测试会报告具体端口并退出。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
```

预期三轮 Vitest 各完成一次采样，类型检查退出 0，构建生成静态首页及两个动态 API 路由，分析打印 20 个子项并更新本报告、摘要和日志样本。首页读取构建时的摘要。查看新一轮摘要时，在分析后再构建一次，然后运行 `pnpm exec next start -H 127.0.0.1 -p 3201`。

## 与规范和源码的对照

| 子项 | 文件与行号 |
| --- | --- |
| H1 | spec `2bbace5` 的 `docs/extensions/overview.mdx:200–268`，`seps/2663-tasks-extension.md:83–109,119–128` |
| H2 | spec `2bbace5` 的 `seps/2663-tasks-extension.md:302–340,344–412,513–515,789–846`，`docs/specification/2026-07-28/basic/transports/streamable-http.mdx:606–636` |
| H3 | vercel/ai `0411a13` 的 `packages/mcp/src/tool/types.ts:151–157,338–344`，`packages/mcp/src/tool/mcp-client.ts:964–989,1030–1043,1099–1127,1256–1276` |
| H4a–b | spec `2bbace5` 的 `seps/3415-events-extension.md:54–104`，vercel/ai `0411a13` 的 `packages/mcp/src/tool/mcp-client.ts:805–829`、`mcp-events.ts:109–167`（同目录） |
| H4c–f、H4h | spec `2bbace5` 的 `seps/3415-events-extension.md:425–468,510–540,553–560,617–665`，vercel/ai `0411a13` 的 `packages/mcp/src/tool/mcp-events.ts:57–88,171–190`、`mcp-event-signature.ts:26–79`、`mcp-event-webhook.ts:99–108,136–171,201–232` |
| H4g | spec `2bbace5` 的 `seps/3415-events-extension.md:939–952` |

安装后的声明文件确认 `@ai-sdk/mcp` 导出 `createMCPClient`、`MCPClientError`、`experimental_createMCPEventWebhook` 和类型 `Experimental_MCPEventStore`、`Experimental_MCPEventSubscription`。客户端 Events API 为 `createMCPClient({ experimental_events: { store } })` 返回的 `client.experimental_events`。`ai` 导出 `generateText`、`isStepCount`，`ai/test` 导出 `MockLanguageModelV4`。H3b 实际顶层消息为 `Failed to process server response`，对应 `mcp-client.ts:984`。

## 偏离任务书

- H2d 的 `count=2` 落在正常同步阈值内。测试进程使用 `DEMO_TEST=1` 和请求头 `x-demo-short-task: 1`，让这一个夹具跑两次 100 ms 异步推进。
- 可选的 `@modelcontextprotocol/server@2.4.0` 自定义 Tasks 注册实验未做。
- HTTPS 地址通过格式校验，实际出站仅允许本机字面量回环地址并禁用重定向。事件源只生成 `order.created`，`stock.low` 对应一个空的 poll 流。任务夹具没有待回答的输入，所以 `tasks/update` 对已知任务验证映射后空确认。
- 未测试服务重启后的后台任务恢复、真实 HTTPS 回调、并行发布的 webhook 安全水位线和长期保留策略。该夹具使用单机共享文件，生产环境应使用 Postgres 或 Redis，以及独立执行器。

## 证据强度

耗时来自同机 `Date.now()`，表示该次运行的量级。取消后的终态时间包含轮询等待。H2f 用两个实例对照验证了进程内存隔离，粘性路由的必要性由这个对照推得。H4f 用相同 webhook ID 主动重放，验证可重复接收及本地去重。H4g 的工具调用由 Mock 预先编排，验证调用链和最小事件负载设计。签名密钥由 SDK 在测试时随机生成并存于临时 `.data/`，测试成功后清除。
