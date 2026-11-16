# LangGraph Store vs Checkpointer（2026-11-16）

验证 LangGraph 两层 persistence：

- **Checkpointer（`MemorySaver`）**：按 `thread_id` 保存单个线程的图状态（本 demo 里是 `messages: string[]`）。
- **Store（`InMemoryStore`）**：跨线程的应用层 KV。本 demo 默认 namespace 为 `[userId, "facts"]`。

钉住版本：`@langchain/langgraph@1.7.4`（对应上游 commit `572657e381fdf5c421904169b0f8c7c54f7f68d4`）。`MemorySaver` 与 `InMemoryStore` 从 `@langchain/langgraph` 官方入口导入（实现位于依赖 `@langchain/langgraph-checkpoint@1.2.2`）。未使用未发布的 langgraphjs main。

技术栈：Next.js 16.4.6（App Router）+ TypeScript + pnpm。节点是确定性纯函数，不调用任何 LLM。H1–H4 不需要 API key。

## 做了什么

- `lib/graph.ts`：最小 `StateGraph`，`compile({ checkpointer, store })`。节点通过 `runtime.store` 读写 Store；若输入匹配 `记住：k=v`（也接受 ASCII 冒号），则 `put` 一条 `{ text }` 事实。
- `lib/runtime.ts`：页面使用的 process-level 单例（`globalThis` 守卫），保证 Route Handler 跨请求复用同一份内存 Store / Checkpointer。
- `tests/store-checkpointer.test.ts`：Vitest 覆盖 H1–H4；无 embedding key 时跳过 H5，不 mock 分数。
- `app/page.tsx`：同一 `userId` 下两列对话（线程 A / 线程 B）+ 右侧 Store 条目列表（`key`、`value`、`createdAt`、`updatedAt`）。用于演示「线程状态隔离、Store 共享」。

## 结果

评测命令：`pnpm test`（Vitest 5.1.0）。本环境实测：**5 passed，1 skipped**（H5）。

### H1：支持

测试：`H1: thread B cannot read thread A's messages but can get/search the Store fact written in A`

同一 `userId`、两条 `thread_id`。线程 A 写入 Store 事实 `favorite_food=pizza`，并留下对话「这是线程 A 的对话。」。

- `graph.getState(thread B)` 在 B 尚未调用时为 `[]`，B 发言后只有 B 的消息，不含 A 的对话或 `favorite_food` 文本。
- A 的 checkpoint 在 B 发言后保持不变。
- `store.get([userId, "facts"], "favorite_food")` 与 `store.search([userId, "facts"])` 都能读到 `{ text: "pizza" }`。

### H2：支持

测试：`H2: two puts to the same (namespace, key) keep createdAt and refresh updatedAt`

对同一 `(namespace, key)` 连续两次 `put`（value 从 `{ text: "blue" }` 改为 `{ text: "green" }`）：

- 第二次覆盖 `value`。
- `createdAt` / `updatedAt` 在 1.7.4 typings 与运行时均为 `Date`（不是 ISO 字符串）。
- `createdAt.getTime()` 与第一次相同；`updatedAt` 在第二次之后严格增大。

实现与 typings 一致：已存在的 key 只更新 `value` 和 `updatedAt`，保留原来的 `createdAt`。

### H3：支持

测试：`H3: search(["tenant","acme"]) returns acme and acme/child, not acme-corp`

写入 `["tenant","acme"]`、`["tenant","acme","child"]`、`["tenant","acme-corp"]` 后，`search(["tenant","acme"])` 只返回前两条（keys：`root-fact`、`child-fact`），不返回 `acme-corp`。`get(["tenant","acme-corp"], "corp-fact")` 仍能取到第三条。

官方 `InMemoryStore` 的前缀匹配按 path segment 用 `:` 拼接后再比较：`namespace === prefix || namespace.startsWith(prefix + ":")`。因此 `tenant:acme-corp` 不会命中前缀 `tenant:acme`。

### H4：支持

测试：`H4: invoke without a thread_id throws, and the error mentions thread_id`

图在 `compile` 时传入 `MemorySaver` 后，调用时不传 `thread_id` 会抛错，错误信息包含 `thread_id`。

实测（`@langchain/langgraph@1.7.4` / `MemorySaver`）错误文本为：

> Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property. …

注意：本 demo 节点本身还要求 `userId`。若既不传 `thread_id` 也不传 `userId`，节点会先抛出 `userId is required…`。H4 测试因此在 *带 userId、不带 thread_id* 的情况下调用，以验证 Checkpointer 的官方约束。Pregel 里另有一条仅在整个 `configurable` 为 `undefined` 时触发的校验（文案同样提到 `thread_id`）；`ensureLangGraphConfig` 通常会补上 `configurable` 对象，所以常见路径是走到 `MemorySaver.put` 再抛出上面这条错误。

### H5：未运行，缺 OPENAI_API_KEY / ANTHROPIC_API_KEY / AI_GATEWAY_API_KEY

测试：`H5: updating the same key lowers the old-text query score and raises the new-text score`（`it.skipIf`）。

当前环境三个变量都未设置，Vitest 跳过该用例。没有 mock embedding 分数，也不把跳过视为失败。可选变量见 `.env.example`。

## 怎么跑

本报告记录的环境：

- Node `v24.22.1`
- pnpm `10.34.6`
- `@langchain/langgraph@1.7.4`（package.json 钉死，lockfile 一致）
- `@langchain/core@1.4.1`（peer）
- `@langchain/langgraph-checkpoint@1.2.2`（官方依赖，导出 MemorySaver / InMemoryStore）
- Next.js `16.4.6`，React `19.3.1`，TypeScript `7.0.2`，Vitest `5.1.0`

在仓库目录 `bot/2026-11-16-langgraph-store-checkpointer/` 下：

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

预期输出：

- `pnpm test`：`5 passed | 1 skipped`（H5 在无 embedding key 时 skip）。退出码 0。
- `pnpm typecheck`：无错误，退出码 0。
- `pnpm build`：Next.js 生产构建成功（页面 `/` 为静态页，`/api/chat` 与 `/api/session` 为动态 Route Handler），退出码 0。
- `pnpm dev`：打开本地页面。在线程 A 发送 `记住：喜欢的颜色=蓝色`，右侧 Store 出现该条目；线程 B 能看到 Store 事实，但看不到 A 的消息。再在 A / B 里随意说话，两列消息互不混入。

不提交 `node_modules/`、`.next/`、`.env`、密钥或 `*.tsbuildinfo`。

## 官方 API 要点（1.7.4）

- `compile({ checkpointer, store })`，调用时传 `{ configurable: { thread_id, userId }, context: { userId } }`。
- 节点从第二个参数 `runtime.store` 读写 Store（`put` / `get` / `search`）。
- Store `Item.createdAt` / `Item.updatedAt` 的 typings 与运行时都是 `Date`。页面 / API 序列化为 ISO 字符串。
- `search(namespacePrefix)` 按段前缀匹配，不是裸字符串前缀。
- 无 checkpointer 时可以不传 `thread_id`；有 `MemorySaver` 时必须传，否则 `put checkpoint` 失败。
