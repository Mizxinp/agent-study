# 主题 4.1 · Function calling / 结构化输出离线实验

用德化陶瓷商品属性抽取夹具复测 Vercel AI SDK 的三家 provider 映射。各工厂注入只返回手写 JSON 或 SSE 的 `fetch`，字面量 `apiKey: 'test'` 用于构造 provider，截获记录只含 URL 和 JSON 请求体。Core 失败路径用 `ai/test` 的 `MockLanguageModelV4`。Next.js 首页在构建时读取 [实测汇总](results/summary.json)，将各假设、请求和断言静态导出。

## 实测结果

运行时共截获 **20 个请求**，**75/75 条断言**通过，另有 H7 的一项 TypeScript 编译期检查。以下请求体只摘录相关字段，完整记录见汇总。

| 假设 | 结论 | 截获请求 | 运行时断言通过 / 总数 |
| --- | --- | ---: | ---: |
| H1 OpenAI 工具 strict 默认 | 支持 | 3 | 4/4 |
| H2 OpenAI 最终输出 strict 默认 | 支持 | 3 | 12/12 |
| H3 OpenAI 兼容改写 | 支持 | 1 | 5/5 |
| H4 Anthropic 映射 | 支持 | 4 | 14/14 |
| H5 Anthropic 回落阈值 | 支持 | 2 | 8/8 |
| H6 Google 映射 | 支持 | 6 | 10/10 |
| H7 Core 失败与修复 | 支持 | 0 | 15/15 |
| H8 SSE 流式参数增量 | 支持 | 1 | 7/7 |
| H9 真实服务端 HTTP 400 | 跳过 | 0 | — |

### H1 · OpenAI 工具 strict 默认

`openai(modelId)` 截获的 URL 为 `https://api.openai.com/v1/responses`，未传 strict 和显式传 true 分别得到下面前两行。第三行来自 `openai.chat(modelId)`，`function` 对象存在且省略 `strict` 键。

```json
{"tools":[{"type":"function","name":"inspect","strict":false}]}
{"tools":[{"type":"function","name":"inspect","strict":true}]}
{"tools":[{"type":"function","function":{"name":"inspect"}}]}
```

### H2 · OpenAI 最终输出 strict 默认

同一个请求同时有工具和最终输出约束。初次截获的格式及 schema 摘录如下。设置 `providerOptions.openai.strictJsonSchema=false` 后，第二次截获的 `text.format.strict` 为 `false`。

```json
{
  "tools": [{"strict": false}],
  "text": {
    "format": {
      "type": "json_schema",
      "strict": true,
      "name": "response",
      "schema": {
        "required": ["form", "glaze", "capacityMl", "uses", "dimensions"],
        "additionalProperties": false,
        "properties": {
          "capacityMl": {"type": "integer", "minimum": 50, "maximum": 5000},
          "quantity": {"type": "integer", "default": 1, "maximum": 9007199254740991}
        }
      }
    }
  }
}
```

`required` 有 5 项，省略 optional 的 `painted` 和 default 的 `quantity`。本地解析补上 `quantity: 1`。第三个请求使用本地范围变体，发出的 `capacityMl` 只有整数类型和描述，`quantity` 为可空整数且同样省略范围关键字。手写响应返回容量 20，仍触发本地 schema 验证失败。

OpenAI 文档要求全必填，该 schema 在 strict 下预期被拒（离线未验证服务端）。[OpenAI Structured Outputs · All fields must be required](https://developers.openai.com/api/docs/guides/structured-outputs#all-fields-must-be-required)

### H3 · OpenAI 兼容改写

发出的工具参数保留 `"properties":{"tag":{"type":"string"}}`，省略 `pattern: "^(?!test).*"` 和字符串 `propertyNames`。结果有 **2 条** `compatibility` 警告，分别对应 propertyNames 和 regex lookaround。将 `propertyNames.type` 改为 `number` 时抛出 `UnsupportedFunctionalityError`，且请求计数仍为 1。

### H4 · Anthropic 映射

`claude-sonnet-4-6` 发出严格工具 `"strict":true`，`input_schema.properties.capacityMl` 保留 `"minimum":50,"maximum":5000`。强制任意工具映射为 `"tool_choice":{"type":"any"}`，指定工具映射为 `"tool_choice":{"type":"tool","name":"inspect"}`。

最终输出走 `"output_config":{"format":{"type":"json_schema",…}}`。其中容量字段变成 `{"description":"容量（毫升）\nminimum: 50; maximum: 5000.","type":"integer"}`，根对象及嵌套 `dimensions` 均有 `"additionalProperties":false`。本地解析得到原手写对象。

`claude-opus-5-5` 的 `required` 降为 `"tool_choice":{"type":"auto"}`，结果有 **1 条** `unsupported/toolChoice` 警告。手写响应包含工具调用，使 core 的原始 required 条件仍然满足。

### H5 · Anthropic 回落阈值

同一 Sonnet 模型下，10 个可选字段发出 `output_config.format.type: "json_schema"`，没有 `json` 工具。11 个可选字段省略 `output_config.format`，发出 `tools[0].name: "json"` 和 `"tool_choice":{"type":"any","disable_parallel_tool_use":true}`。手写 `tool_use(json)` 输入 `{"attribute1":"盖碗"}`，`result.output` 得到同一对象。10/11 的分界与钉定源码一致。

### H6 · Google 映射

按顺序截获的 `toolConfig.functionCallingConfig` 为 `{"mode":"VALIDATED"}`（两个工具中一个 strict）、`{"mode":"AUTO"}`、`{"mode":"ANY"}`、`{"mode":"ANY","allowedFunctionNames":["inspect"]}`、`{"mode":"NONE"}`。最终输出请求的 `generationConfig` 有 `"responseMimeType":"application/json"`，`responseJsonSchema.properties.kind` 中原始 `"const":"釉色"` 变为 `"enum":["釉色"]`，本地解析得到 `{"kind":"釉色"}`。

### H7 · Core 失败与修复

纯文本违反 required 时，`generateText` 抛 `ToolChoiceViolationError`，`streamText` 的该步 `finishReason` 为 `"error"`，且发出 **1 个**该类 error part。非 JSON 和容量 20 的合法 JSON 分别触发 `NoObjectGeneratedError`，消息包含 `could not parse` 和 `did not match schema`，两者的 `error.text` 都保留原文。

工具参数为单独的 `{` 时，无修复路径产生 `invalid:true` 和 **1 个** `tool-error`，执行 **0 次**。启用 `repairToolCall` 后，修复回调与工具执行各 **1 次**，执行参数为 `{"capacityMl":120}`，产生 **1 个**工具结果。

`generateText` 的 `output` 参数路径没有 `repairText`。类型测试在调用处用 `@ts-expect-error` 锁定该字段的编译错误。如果将来该字段成为合法参数，`tsc` 会因指令未使用而失败。这一检查独立于 75 条运行时断言。

### H8 · SSE 流式参数增量

`response.output_item.added` 后的 **3 个**参数 delta 分别为 `{"capacityMl":`、`80`、`}`，拼成 `{"capacityMl":80}`。`response.output_item.done` 的 `arguments` 为 `{"capacityMl":120}`。公开 `fullStream` 的最终 `tool-call.input` 为已校验的对象 `{"capacityMl":120}`，工具执行 **1 次**且收到相同值。流中 **0 个** error part。

## 夹具与 SHA-256

从 `ai` 直接导入 `asSchema`，使用 `await asSchema(fixture).jsonSchema` 导出，哈希覆盖落盘 JSON 的 UTF-8 字节（含末尾换行）。`ceramicAttrStrictSafe` 把两个可缺省字段改为必填可空，保留 zod 的容量约束。派生的 `ceramicAttrLocalRange` 用 `ai.jsonSchema` 包装移除数值上下限的 wire schema，`validate` 仍调用原 zod 规则。Muse 标签夹具根部有 2 个 `oneOf` 分支。

| 文件 | SHA-256 |
| --- | --- |
| `ceramicAttr.json` | `3912fcfd877a7e82ef1f4e0ac785095a9089c1c83a3c9a00789b389b495d529f` |
| `ceramicAttrStrictSafe.json` | `b1d2b9178eb5ff6300382dded05cb55c3a157c061d00842eb41a6b460a436720` |
| `ceramicAttrLocalRange.json` | `42ecd0d35d07f241a5f773e6637c3c375a3306f27b3673f2661bac70514e14f1` |
| `museTagUnion.json` | `af5029ba904258f595cf475b8384168829d2dd85920be916f8cb5a017743462e` |
| `optional10.json` | `4caa8c2e5e6955a9101b7fadadf757b37f34bd1a566a62035f66dd6c88afbf35` |
| `optional11.json` | `5c952386cbfbbe1bbc6079173a12da7a2b5e9a0d2ec06280cf7317d0068af8bf` |

## 模型与源码对照

- OpenAI `gpt-4.1-mini` 用同一个模型 ID 对照默认 Responses、显式 Chat 和 Responses SSE，请求映射由入口决定。
- Anthropic `claude-sonnet-4-6` 的能力表同时启用 `nativeStructuredOutput` 和 `forcedToolUse`，覆盖 H4 的严格工具与 H5 的原生、回落路径。[能力表 L319–333](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/anthropic-model-catalog.ts#L319-L333)
- Anthropic `claude-opus-5-5` 同样启用原生结构化输出，且 `forcedToolUse:false`，用于 H4 的降级分支。[能力表 L151–165](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/anthropic-model-catalog.ts#L151-L165)
- Google `gemini-2.5-flash` 用 `createGoogle` 的生成内容模型入口覆盖函数选择和响应 schema 映射。

下表链接固定到 `vercel/ai@a457990a33491a9bfd6e7a48318d23a16c0ac95d`。

| 假设 | 源码文件与行号 |
| --- | --- |
| H1 | [openai-provider.ts L333–378](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/openai-provider.ts#L333-L378) · [openai-responses-prepare-tools.ts L926–963](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/responses/openai-responses-prepare-tools.ts#L926-L963) · [openai-chat-prepare-tools.ts L36–90](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/chat/openai-chat-prepare-tools.ts#L36-L90) |
| H2 | [openai-responses-language-model.ts L563–578](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/responses/openai-responses-language-model.ts#L563-L578) · [同文件 L648–676](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/responses/openai-responses-language-model.ts#L648-L676) · [schema.ts L255–285](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/provider-utils/src/schema.ts#L255-L285) |
| H3 | [normalize-openai-json-schema.ts L8–84](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/normalize-openai-json-schema.ts#L8-L84) · [同文件 L168–199](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/normalize-openai-json-schema.ts#L168-L199) |
| H4 | [anthropic-prepare-tools.ts L93–145](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/anthropic-prepare-tools.ts#L93-L145) · [同文件 L479–568](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/anthropic-prepare-tools.ts#L479-L568) · [anthropic-language-model.ts L983–1010](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/anthropic-language-model.ts#L983-L1010) · [sanitize-json-schema.ts L34–143](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/sanitize-json-schema.ts#L34-L143) |
| H5 | [supports-native-structured-output-schema.ts L8–54](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/supports-native-structured-output-schema.ts#L8-L54) · [anthropic-language-model.ts L1321–1357](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/anthropic-language-model.ts#L1321-L1357) · [同文件 L1733–1744](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/anthropic/src/anthropic-language-model.ts#L1733-L1744) |
| H6 | [google-prepare-tools.ts L241–326](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/google/src/google-prepare-tools.ts#L241-L326) · [google-language-model.ts L410–421](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/google/src/google-language-model.ts#L410-L421) · [sanitize-response-json-schema.ts L3–8](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/google/src/sanitize-response-json-schema.ts#L3-L8) |
| H7 | [generate-text.ts L1466–1488](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/ai/src/generate-text/generate-text.ts#L1466-L1488) · [stream-language-model-call.ts L714–797](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/ai/src/generate-text/stream-language-model-call.ts#L714-L797) · [output.ts L140–219](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/ai/src/generate-text/output.ts#L140-L219) · [parse-tool-call.ts L41–134](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/ai/src/generate-text/parse-tool-call.ts#L41-L134) · [generate-object.ts L121](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/ai/src/generate-object/generate-object.ts#L121) |
| H8 | [openai-responses-language-model.ts L1819–1839](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/responses/openai-responses-language-model.ts#L1819-L1839) · [同文件 L2086–2160](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/responses/openai-responses-language-model.ts#L2086-L2160) · [同文件 L2733–2746](https://github.com/vercel/ai/blob/a457990a33491a9bfd6e7a48318d23a16c0ac95d/packages/openai/src/responses/openai-responses-language-model.ts#L2733-L2746) |

## 运行与验收

实测环境为 Node.js **24.22.1**、pnpm **10.34.6**。在本实验目录执行。安装允许访问 registry，余下路径均使用本地 mock、夹具与构建数据。

| 命令 | 预期输出 | 本轮退出码 |
| --- | --- | ---: |
| `pnpm install` | 安装精确依赖，生成 lockfile | 0 |
| `pnpm install --frozen-lockfile` | 冻结 lockfile 复验 | 0 |
| `pnpm test` | 8 个测试通过，含预期兼容与降级警告 | 0 |
| `pnpm typecheck` | 类型检查通过，包含 H7 编译期断言 | 0 |
| `NEXT_TELEMETRY_DISABLED=1 pnpm build` | 静态首页 `/`，输出 `out/index.html` | 0 |
| `pnpm analyze` | 打印 H1–H8 表格，重生成夹具和 `results/summary.json` | 0 |
| `pnpm live` | 本轮打印「跳过：缺少密钥」 | 0 |

修改夹具或实验后，先运行 `pnpm analyze` 刷新汇总，再构建以查看更新。可选的 `pnpm live` 仅检查三个现有环境变量是否齐全。本轮缺少密钥，H9 跳过。即使环境变量齐全，本示例的该入口也只打印离线跳过信息。

依赖均精确固定。运行依赖为 `ai@7.0.181`、`@ai-sdk/openai@4.0.123`、`@ai-sdk/anthropic@4.0.108`、`@ai-sdk/google@4.0.126`、`next@16.4.6`、`react@19.3.1`、`react-dom@19.3.1`、`zod@4.6.7`。开发依赖为 `typescript@7.0.2`、`vitest@5.1.0`、`tsx@4.23.15`、`@types/node@26.6.6`、`@types/react@19.3.0`、`@types/react-dom@19.3.0`。pnpm 安装提示跳过 esbuild 安装脚本，实际测试、分析及构建均通过。

## 未解决的问题

真实服务端是否对 OpenAI 的可缺省 strict 输出字段、Anthropic 的严格工具数值约束返回 HTTP 400，仍留待 H9 验证。根 `oneOf` 本轮仅确认夹具导出形状，其线上兼容性仍未验证。
