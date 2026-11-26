# 主题 4.3 · MCP 2026-07-28 无状态核心与 MRTR

德化陶瓷店夹具通过 Next.js App Router 的 `/api/mcp` 提供查询、带确认的改价、进度导出、采样请求和目录变更通知。两台生产模式 Next.js 实例由仅绑定回环地址的 Node 轮询代理转发。改价首轮返回表单和有签名的状态，第二轮从请求恢复状态并校验参数摘要。对照组验证独立密钥及旧协议拒绝。模型调用由 `MockLanguageModelV4` 在本进程完成。

## 实测结果

| 假设 | 结论 | 实测 |
| --- | --- | --- |
| H1 · 跨实例无状态 | 支持 | `get_sku` 10/10 成功，依次落在 3102、3101，重复 5 次。全段 11 个响应中会话头 0 次，`initialize` 0 次。首个包为发往 3101 的 `server/discover`。 |
| H2 · HTTP 校验 | 支持 | 3101 直连时，两种头部不一致均为 HTTP 400 / `-32020`，未知版本为 HTTP 400 / `-32022`，GET 和 DELETE 均为 HTTP 405 / `-32000`，通知为 HTTP 202、空响应体。 |
| H3 · 默认时代 | 支持 | 官方客户端默认首包 `initialize`，查询成功。官方 auto 和 AI SDK 默认首包均为 `server/discover`。官方 auto 的工具请求同时有 `_meta` 和三项现代镜像头。严格对照组的旧握手得到 400 / `-32022`。 |
| H4 · 改价往返与有签名状态 | 支持 | 共享密钥时，自动改价两轮为 3102 → 3101，ID 为 0 → 1，均为 HTTP 200，第二轮携带两项续轮字段。详细对照见下。 |
| H5 · AI SDK 改价、采样拒绝和工具桥接 | 支持；默认能力下的报错文案不支持 | 改价成功，表单处理器调用 1 次。默认能力下采样先被服务端拒绝。显式声明 sampling 后，客户端抛出预期的 `Unsupported input request`。Mock 执行 2 步，第二步接收 `get_sku` 的工具输出。 |
| H6 · 进程内事件总线 | 支持 | 3101 的订阅返回 HTTP 200，收到 3101 发布的 `notifications/tools/list_changed`。通知和订阅确认的 `subscriptionId` 均为 119。3102 发布后等待 2 秒，收到 0 条通知。 |
| H7 · 关闭 SSE 取消请求 | 支持 | `slow_export` 由 3101 处理，HTTP 200。客户端在进度 5 中止，服务端在 2 ms 后观察到取消并停在进度 5。观察 2.8 秒，后续进度 0 条，`notifications/cancelled` POST 0 条。 |

H2 的响应体片段如下。

| 子项 | 发送内容 | 响应体片段 |
| --- | --- | --- |
| a | `tools/call` 配 `Mcp-Method: tools/list` | `the body names method tools/call but the Mcp-Method header names tools/list` |
| b | `params.name=get_sku` 配 `Mcp-Name: update_price` | `the body carries params.name="get_sku" but the Mcp-Name header names "update_price"` |
| c | 头和 `_meta` 都声明 `1900-01-01` | `Unsupported protocol version: 1900-01-01`，`data.supported=["2026-07-28"]` |
| d | GET 和 DELETE | `Method not allowed.`，两次均有 `Allow: POST` |
| e | 无 ID 的 `notifications/initialized` | 空 |

H3d 使用 `legacy: 'reject'`。代理记录 `POST initialize → 3111 → 400`。官方客户端抛出 `SdkHttpError`，SDK code 为 `CLIENT_HTTP_NOT_IMPLEMENTED`，消息以 `Error POSTing to endpoint:` 开头，内嵌 JSON-RPC `-32022` 和 `Unsupported protocol version: 2025-11-25`。直连复测返回相同的 HTTP 状态与 JSON-RPC 错误码。

H4 使用原始 HTTP 请求手动完成负向对照。

| 子项 | 实测 |
| --- | --- |
| b · 改一字符、换主体、过期 | 三项均为 HTTP 200 / JSON-RPC `-32602`，消息 `Invalid or expired requestState`，`data.reason=invalid_request_state`。短 TTL 为 1 秒，等待 2 秒后提交第二轮。 |
| b · 解码、改参数 | base64url 解码可读出 `CUP-WIRE`、`91`，说明签名包可被读取。续轮将价格改为 92，HTTP 200，工具返回 `isError: true` 和 `Price arguments differ from signed state`。 |
| c · 每个进程独立密钥 | 3112 → 3111 的续轮为 HTTP 200 / `-32602`。中间插入一次查询使两轮均落在 3112 后，HTTP 200 且 `applied: true`。 |
| d · 相同状态重放 | 两次合法续轮均落在 3101，HTTP 200。第一次 `applied: true`，第二次验签仍通过且返回 `duplicate: true, applied: false`。去重由业务 Map 执行。 |

H5b 默认能力的 `ask_model` 请求收到 HTTP 400，声明 sampling 的对照请求收到 HTTP 200。默认能力下，`MCPClientError` 的消息为 `Cannot request input 'sample' (sampling/createMessage): the request's client capabilities do not declare the required capability`。声明 sampling 后仍使用同一 AI SDK HTTP 客户端实现，错误变为 `MCPClientError: Unsupported input request: sampling/createMessage. Only form elicitation is supported.`。H5c 的第二步模型输入含工具结果 `CUP-001`、德化白瓷杯、价格 88、处理端口 3101，最终文本为「已查询德化白瓷杯。」。

代理样本摘录，用 `hasState` 和 `hasResponses` 记录字段是否存在，会话头也只记录是否存在。

| 实验 | method / name | 实例端口 | HTTP | ID / 续轮信息 |
| --- | --- | --- | --- | --- |
| H1 | `server/discover` | 3101 | 200 | `server-discover-probe-1` |
| H1 | `tools/call / get_sku` | 3102、3101 | 200、200 | 0、1，响应会话头均为 false |
| H4a | `tools/call / update_price` | 3102、3101 | 200、200 | 0、1，两个续轮字段均从 false 变为 true |
| H7 | `tools/call / slow_export` | 3101 | 200 | 0，取消发生在已打开的响应流 |

完整的结构化实测数据和节选分别见 [summary.json](results/summary.json) 与 [wire-log.sample.jsonl](results/wire-log.sample.jsonl)。

## 复现

实测使用 Node.js **24.22.1** 和 pnpm **10.34.6**。在本目录执行以下命令。

```sh
pnpm install
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
```

六条命令均退出 0。测试自动构建并启动两组生产实例，7 项测试应通过，随后关闭代理与子进程。主组在 3101 和 3102，代理在 3100。对照组在 3111 和 3112，代理在 3110，同时启用独立密钥和旧协议拒绝。端口占用时，global setup 会报告具体的回环地址及端口。分析脚本打印 H1–H7 表格，更新两个结果文件。首页在构建时读取 `results/summary.json`。要在首页查看刚生成的新结果，分析后再构建一次。

依赖安装可访问 registry。测试阶段所有 HTTP 请求走本机回环，模型使用 `ai/test` mock。主组已注入 32 字节随机密钥，由测试运行时生成。对照密钥由各进程自行生成。完整代理记录和取消诊断留在本地，提交仅含筛选出的协议字段与测量结果。

## 精确版本

| 项目 | 版本 |
| --- | --- |
| Next.js | `next@16.4.6` |
| MCP 官方 SDK | `@modelcontextprotocol/server@2.4.0`、`@modelcontextprotocol/client@2.4.0` |
| AI SDK | `@ai-sdk/mcp@2.0.105`、`ai@7.0.182` |
| 验证与 UI | `zod@4.6.7`、`react@19.3.1`、`react-dom@19.3.1` |
| 开发工具 | `typescript@7.0.2`、`vitest@5.1.0`、`tsx@4.23.15` |
| 类型 | `@types/node@26.6.6`、`@types/react@19.3.0`、`@types/react-dom@19.3.0` |

## 实际导出与源码对照

- 服务端使用 `createMcpHandler`、`McpServer.registerTool`、`inputRequired`、`inputRequired.elicit`、`acceptedContent`、`createRequestStateCodec`、`ProtocolError` 和 `ProtocolErrorCode`。使用 codec 的 `mint(payload, ctx)` 与 `requestState.verify`，通过 `ctx.mcpReq.requestState<T>()` 和 `ctx.mcpReq.inputResponses` 读取续轮数据。发布事件用 `handler.notify.toolsChanged()`，进度和中止用 `ctx.mcpReq.notify` 和 `ctx.mcpReq.signal`。
- 官方客户端使用 `Client`、`StreamableHTTPClientTransport`、`client.callTool` 和 `client.setRequestHandler('elicitation/create', handler)`。订阅和负向协议测试直接使用 HTTP。
- AI SDK 使用 `createMCPClient`、`ElicitationRequestSchema`、`MCPClientError`、`client.onElicitationRequest(ElicitationRequestSchema, handler)` 和 `client.tools()`，以及 `ai` 的 `generateText`、`stepCountIs` 和 `ai/test` 的 `MockLanguageModelV4`。

| 假设 | 钉定源码与实测的对应 |
| --- | --- |
| H1 | 每请求运行工厂，固定现代版本也会先发现。 [TS SDK 951fe56 · createMcpHandler.ts L784–815](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/createMcpHandler.ts#L784-L815) [versionNegotiation.ts L62–105](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/client/src/client/versionNegotiation.ts#L62-L105) |
| H2 | 版本优先于标准头校验，通知以空响应确认，405 携带 Allow。 [TS SDK 951fe56 · createMcpHandler.ts L729–760](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/createMcpHandler.ts#L729-L760) [createMcpHandler.ts L275–287](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/createMcpHandler.ts#L275-L287) [perRequestTransport.ts L232–247](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/perRequestTransport.ts#L232-L247) |
| H3 | 官方默认旧时代，AI SDK 默认探测，严格服务拒绝 legacy。 [TS SDK 951fe56 · client.ts L199–237](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/client/src/client/client.ts#L199-L237) [createMcpHandler.ts L925–944](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/createMcpHandler.ts#L925-L944) [Vercel AI 7dc4998 · mcp-client.ts L219–233](https://github.com/vercel/ai/blob/7dc49985c58ae25456aa1f23c28f2f891266629f/packages/mcp/src/tool/mcp-client.ts#L219-L233) |
| H4 | 客户端自动续轮。服务端前置验证使用带 TTL 与绑定标签的 HMAC。工具 handler 的异常被包装为工具错误。 [TS SDK 951fe56 · client.ts L239–257](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/client/src/client/client.ts#L239-L257) [requestStateCodec.ts L112–250](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/requestStateCodec.ts#L112-L250) [server.ts L729–746](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/server.ts#L729-L746) [mcp.ts L296–321](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/mcp.ts#L296-L321) |
| H5 | 服务端先查能力，AI SDK MRTR 仅处理表单 elicitation。 [TS SDK 951fe56 · server.ts L699–724](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/server.ts#L699-L724) [Vercel AI 7dc4998 · mcp-client.ts L895–975](https://github.com/vercel/ai/blob/7dc49985c58ae25456aa1f23c28f2f891266629f/packages/mcp/src/tool/mcp-client.ts#L895-L975) |
| H6 | 默认事件总线在进程内，订阅 router 为 SSE 事件加订阅 ID。 [TS SDK 951fe56 · createMcpHandler.ts L701–709](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/createMcpHandler.ts#L701-L709) [serverEventBus.ts L25–60](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/serverEventBus.ts#L25-L60) [listenRouter.ts L202–236](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/listenRouter.ts#L202-L236) |
| H7 | 现代 HTTP 取消走原请求中止，服务端流关闭后终止交换。 [TS SDK 951fe56 · protocol.ts L1427–1489](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/core-internal/src/shared/protocol.ts#L1427-L1489) [perRequestTransport.ts L390–418](https://github.com/modelcontextprotocol/typescript-sdk/blob/951fe5603a7ec0b2dcb6a0b95d92cd86f93ad9e5/packages/server/src/server/perRequestTransport.ts#L390-L418) |

## 与任务书写法的差异

- 官方客户端固定版本的实际选项是 `versionNegotiation: { mode: { pin: '2026-07-28' } }`，连接时会探测一次。表单使用 `inputRequired.elicit`；采样使用 `inputRequests` 里的 `sampling/createMessage`。
- H4b 的参数摘要由业务 handler 拒绝，HTTP 200 并返回工具级错误。codec 前置验证失败才产生 JSON-RPC `-32602`。短 TTL 仅由测试 SKU `CUP-TTL` 选择，普通签发保留 600 秒。
- H5b 额外使用声明 sampling 的客户端，经过服务端能力检查后测得客户端拒绝的预期文案。默认能力的实测错误另行保留。

## 未解决的问题

`x-demo-user` 仅为 demo 主体，生产身份必须来自已验证的 token。价格和幂等表位于进程内，多实例需要共享持久存储与原子条件写入。`InMemoryServerEventBus` 在多实例下需要由外部 pub/sub 连接各进程。状态密钥轮换、跨进程去重、长时间订阅重连与真实宿主兼容性均未在本实验验证。H7 的毫秒差为同一台机器上的一次测量。
