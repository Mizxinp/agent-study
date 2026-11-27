# LangGraph interrupt / HITL 退款审批实验

Next.js App Router 提供退款表单和两个 Route Handler。`POST /api/chat` 启动退款图，页面展示审批摘要及 `__interrupt__`。`POST /api/approve` 按 `decisionId` 查找服务端持有的图和线程，校验店长身份后恢复。批准才向本地 JSONL 追加记录，拒绝直接结束。账本默认是 `.data/ledger.jsonl`，可通过 `REFUND_DATA_DIR` 隔离。

## 运行与复验

实测 Node.js `v24.22.1`、pnpm `10.34.6`。主锁文件解析 LangGraph `1.7.4`、Core `1.3.4` 和 Checkpoint `1.2.2`。1.7.4 发布包声明 Core peer `^1.3.4`、Checkpoint 依赖 `^1.2.2`，此处也通过 override 将传递依赖锁到 `1.2.2`。

在 demo 目录执行以下命令，实测退出码依次为 `0 / 0 / 0 / 0 / 0`。

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
NEXT_TELEMETRY_DISABLED=1 pnpm build
pnpm analyze
```

测试通过 12 项。构建生成 `/`、`/api/chat` 和 `/api/approve`。分析打印结论表并生成 [summary.json](results/summary.json)，底层观测由测试写入 [observations-1.7.4.json](results/observations-1.7.4.json)。安装完成后，测试、类型检查、构建和分析在无外部网络的独立网络命名空间中退出 0。pnpm 提示跳过了 esbuild 的安装脚本，本机的测试和构建仍通过。

运行 `pnpm start` 后打开 `http://localhost:3000`，填写订单号和整数退款金额，发起后使用同一个演示店长批准或拒绝。演示店长由请求头 `x-demo-user` 提供，实际部署需要用受信任的服务端会话解析身份。

## 1.7.4 实测

| 假设 | 结论 | 关键观测 |
| --- | --- | --- |
| H1 · P0 | 支持 | 节点内 `interrupt()` 抛 `GraphValueError`，错误码 `MISSING_CHECKPOINTER`。无 checkpointer 的图接收 `Command({ resume })` 抛 `Error`。完整消息见下。 |
| H2 · P0 | 支持 | 首次暂停时 before/after/账本行数为 1/0/0。批准恢复后为 2/1/1。 |
| H5a · P0 | 支持 | 两个节点同时暂停。按中断 ID 传 map，一次恢复得到 `left="L", right="R"`，待答为 0。 |
| H6a · P0 | 支持 | Zod schema 出现在 `response_schema`。非法 `approved: "yes"` 抛 `$ZodError`，路径为 `approved`。同一线程重试合法值得到 `{ approved: true, note: "" }`。 |
| H7 · P0 | 支持 | 一次提交里 send 合法、check 非法，抛 `$ZodError`，只有 check 任务标为失败，send 副作用计数为 1。只纠正 check 后两个分支均有结果，send 计数仍为 1。 |
| H8 · P0 | 支持 | 暂停后，新线程 resume 返回 `{}`。原线程仍可恢复并得到 `"accepted"`。 |
| H10 · P0 | 支持 | 发起 200，响应只有 `decisionId`、退款摘要和中断展示。非所有者 403，无关 ID 404。服务端忽略客户端夹带的恢复材料，只使用自己保管的状态。两次批准都夹带金额 9999，响应 200 和 409，账本为原金额 100、共 1 行。另发一笔并拒绝，返回 200/`rejected`，账本仍为 1 行。 |
| H3 | 支持 | 吞下 `GraphInterrupt` 时节点跑完，`__interrupt__` 为 0 项。识别后重抛时节点未跑完，待答为 1。 |
| H4 | 支持 | 正常顺序得到 `name="小林", amount=100`。已有 name 答案后交换调用顺序再恢复，得到 `amount="小林", name=100`。 |
| H5b | 记录 | 默认模式传标量 `"single"`，得到 `left="single", right="single"`，待答为 0。 |
| H5c | 支持 | 严格模式有两个待答时传标量，抛 `UnknownInterruptError`，两项仍待答。完整消息见下。 |
| H6b | 支持 | `response_schema` 原样为 `{ "type": "boolean" }`，不合规的字符串 `"yes"` 仍成为节点答案。 |
| H9 | 记录 | 已批准后重复提交，HTTP 409，响应 `{"error":"审批已消费"}`。提交前后账本均为 1 行。应用层在恢复前领取审批，重复提交止于 Route Handler。 |

H1 和 H5c 的完整 `Error.message` 用 JSON 字符串表示，保留换行及末尾换行。

```json
{
  "H1.interrupt": "No checkpointer set\n\nTroubleshooting URL: https://docs.langchain.com/oss/javascript/langgraph/MISSING_CHECKPOINTER/\n",
  "H1.resume": "Cannot use Command(resume=...) without checkpointer",
  "H5c": "When there are multiple pending interrupts, you must specify the interrupt id when resuming."
}
```

H6a 和 H7 的校验错误都在 `approved` 路径上报告 `invalid_type`，条目消息为 `Invalid input: expected boolean, received string`，完整错误对象留在 JSON 观测。官方文档将其称为 `ZodError`，此处精确版本组合运行时的 `error.name` 为 `$ZodError`。测试按校验条目的路径和错误码断言。用到的 LangGraph 导出和调用签名符合源码笔记，包括 `interrupt(value, { responseSchema })`、`GraphInterrupt`、`isGraphInterrupt`、`UnknownInterruptError`、`INTERRUPT`、`isInterrupted` 和 `Command({ resume })`。选入的 `__pregel_strict_resume` 来自运行时内部配置。[官方 Interrupts 文档](https://docs.langchain.com/oss/javascript/langgraph/interrupts)

## 源码对照

以下行号均在只读克隆的 `572657e381fdf5c421904169b0f8c7c54f7f68d4` 上核对。

| 假设 | 实现对照 |
| --- | --- |
| H1 | 检查 checkpointer 后抛错。[interrupt.ts L107–112](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/interrupt.ts#L107-L112) · [loop.ts L1717–1719](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/pregel/loop.ts#L1717-L1719) |
| H2–H4 | 节点通过计数下标读取已答值，无待用答案时抛出 `GraphInterrupt`。[interrupt.ts L125–164](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/interrupt.ts#L125-L164) |
| H5 | loop 识别 map 并选择加入严格校验，任务 scratchpad 按中断 ID 查找 map 值。[loop.ts L1704–1731](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/pregel/loop.ts#L1704-L1731) · [loop.ts L2403–2430](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/pregel/loop.ts#L2403-L2430) · [algo.ts L1518–1539](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/pregel/algo.ts#L1518-L1539) |
| H6 | Zod 走解析失败标记，schema 在抛出中断时附上。[interrupt.ts L114–123](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/interrupt.ts#L114-L123) · [interrupt.ts L156–164](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/interrupt.ts#L156-L164) |
| H7 | runner 对非法 resume 保留兄弟任务运行机会，本实验用独立计数验证。[runner.ts L182–187](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/pregel/runner.ts#L182-L187) · [interrupt.test.ts L150–209](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/langgraph-core/src/tests/interrupt.test.ts#L150-L209) |
| H8 | MemorySaver 根据线程取 checkpoint。[memory.ts L217–242](https://github.com/langchain-ai/langgraphjs/blob/572657e381fdf5c421904169b0f8c7c54f7f68d4/libs/checkpoint/src/memory.ts#L217-L242) |

## H11 · 1.7.5 对照

`bash scripts/compare-1.7.5.sh` 在临时目录复用同一测试和初始锁文件。对照使用 LangGraph `1.7.5`、Core `1.3.4`、Checkpoint `1.2.3`。1.7.5 发布包的 Checkpoint 依赖范围为 `^1.2.3`。脚本退出 0，12 项通过，[1.7.5 原始观测](results/observations-1.7.5.json) 与 1.7.4 逐项深比较相同。主锁文件保持 1.7.4。首次准备对照依赖时可能需要访问 registry。

只读对照 commit `e58f0c6d21882af337bf4b7a652208e5c619b705` 可见 writer 禁用上下文绑定、runner 用 Map 管理进行中的任务、loop 缓存 channel 分类。上述实测只覆盖本实验的恢复路径。[1.7.5 对照 commit](https://github.com/langchain-ai/langgraphjs/commit/e58f0c6d21882af337bf4b7a652208e5c619b705)

## 证据范围

- H9/H10 的单次消费由应用在同一进程内同步更新 Map 实现。早课 H6f 直接重复恢复同一 OpenAI SDK 快照后写入两行。早课 H10.replay 则由应用层原子 rename 返回 200/409，账本一行。两课的应用层证据均来自各自的审批入口。[早课 REPORT](https://github.com/Mizxinp/agent-study/blob/a2f32fc188064878c09072c889dafb3d7ae1a778/bot/2026-11-27-agent-orchestration/REPORT.md)
- H10 直接调用 Route Handler 测试，另以构建后的 Next.js 在回环地址复验页面、发起、403/404、并发 200/409、重复 409 和账本一行。进程重启会丢失待批图和消费记录，JSONL 文件仍在。领取后到写账本之间若出错，消费记录仍保留以避免重复写入。崩溃恢复、跨进程消费和真实身份系统超出实验证据范围。
- H7 的证据限于这一并行图的校验失败与重试。所有 P1 均有观测。实验使用纯本地输入和文件副作用，未涉及模型决策质量。
