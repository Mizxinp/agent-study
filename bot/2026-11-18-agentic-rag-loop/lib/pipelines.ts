import {
  generateText,
  hasToolCall,
  isStepCount,
  streamText,
  tool,
  type LanguageModel,
  type StepResult,
  type ToolSet,
} from "ai";
import { z } from "zod";
import { products } from "./data";
import { filterProducts } from "./filter";
import { formatChunks, hybridSearch } from "./retrieval";

export const FIXED_TOP_K = 8;
export const AGENTIC_SEARCH_TOP_K = 5;
export const AGENTIC_MAX_STEPS = 6;
/** SDK 内部重试次数（指数退避 2s 起）；CR 端偶发 429。 */
export const LLM_MAX_RETRIES = Number(process.env.LLM_MAX_RETRIES ?? 6);

export const SYSTEM_PROMPT = [
  "你是德化陶瓷合成商品库的检索问答助手。所有商品、型号、价格、上架日期都是合成虚构数据。",
  "只能依据提供的资料（检索片段或工具结果）回答，不要用常识补全。",
  "最终答案必须是商品型号（SKU，如 DH-TC-0915）集合，通过 answer 工具提交：skus 填所有满足条件的型号。",
  "如果资料里没有满足条件的商品或信息不足，调用 answer 且 skus 为空数组，并在 rationale 里说明信息不足。",
].join("\n");

const answerInput = z.object({
  skus: z.array(z.string()).describe("满足问题条件的全部商品型号；无答案时为空数组"),
  rationale: z.string().describe("简短中文理由"),
});

const answerTool = tool({
  description: "提交最终答案（型号集合）。调用后流程结束。",
  inputSchema: answerInput,
  execute: async ({ skus }) => ({ accepted: true, count: skus.length }),
});

export const filterInput = z.object({
  skus: z.array(z.string()).optional().describe("只看这些型号"),
  series: z.string().optional().describe("系列：茶器/碗/香器/杯/花器/餐盘"),
  glaze: z.string().optional().describe("釉色：猪油白釉/象牙白釉/建白釉/中国白釉"),
  shape: z.string().optional().describe("器型关键字，如 花瓶、盖碗"),
  minCapacityMl: z.number().optional(),
  maxCapacityMl: z.number().optional(),
  minPriceCny: z.number().optional(),
  maxPriceCny: z.number().optional(),
  listedAfter: z.string().optional().describe("上架日期下界 YYYY-MM-DD（含）"),
  listedBefore: z.string().optional().describe("上架日期上界 YYYY-MM-DD（含）"),
});

export function agenticTools() {
  return {
    search: tool({
      description: `在商品正文与属性表里做 BM25+向量混合检索，返回 top${AGENTIC_SEARCH_TOP_K} 片段。适合查工艺、烧成温度、售后天数、使用限制等正文事实。`,
      inputSchema: z.object({ query: z.string().describe("中文检索语句") }),
      execute: async ({ query }) =>
        (await hybridSearch(query, AGENTIC_SEARCH_TOP_K)).map((c) => ({
          id: c.id,
          sku: c.model,
          text: c.text,
        })),
    }),
    filterProducts: tool({
      description:
        "按结构化属性表过滤商品（型号/系列/釉色/器型/容量/价格/上架日期），返回匹配行的全部属性。数值与日期区间含端点。",
      inputSchema: filterInput,
      execute: async (f) => filterProducts(products, f),
    }),
    answer: answerTool,
  } satisfies ToolSet;
}

export type StepTrace = {
  step: number;
  finishReason: string;
  toolCalls: { toolName: string; input: unknown }[];
  toolResults: { toolName: string; summary: string; error?: boolean }[];
  inputTokens: number;
  outputTokens: number;
};

export type RunResult = {
  pipeline: "fixed" | "agentic";
  answer: string[] | null;
  rationale: string;
  steps: StepTrace[];
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  finishReason: string;
  warnings: string[];
};

function summarize(output: unknown): string {
  if (Array.isArray(output)) {
    const ids = output.map((o) => (o && typeof o === "object" ? ((o as { sku?: string; id?: string }).sku ?? (o as { id?: string }).id) : String(o)));
    return `${output.length} 条：${ids.join(", ")}`;
  }
  const s = JSON.stringify(output);
  return s.length > 160 ? s.slice(0, 160) + "…" : s;
}

export function traceSteps(steps: StepResult<ToolSet>[]): StepTrace[] {
  return steps.map((s, i) => ({
    step: i + 1,
    finishReason: s.finishReason,
    toolCalls: s.toolCalls.map((c) => ({ toolName: c.toolName, input: c.input })),
    toolResults: s.content.flatMap((p) =>
      p.type === "tool-result"
        ? [{ toolName: p.toolName, summary: summarize(p.output) }]
        : p.type === "tool-error"
          ? [{ toolName: p.toolName, summary: String(p.error), error: true }]
          : [],
    ),
    inputTokens: s.usage.inputTokens ?? 0,
    outputTokens: s.usage.outputTokens ?? 0,
  }));
}

/** 从所有步里找最后一次 answer 工具调用；没有就返回 null（未作答）。 */
export function extractAnswer(steps: StepResult<ToolSet>[]): { skus: string[] | null; rationale: string } {
  for (let i = steps.length - 1; i >= 0; i--) {
    const call = [...steps[i].toolCalls].reverse().find((c) => c.toolName === "answer");
    if (call) {
      const parsed = answerInput.safeParse(call.input);
      if (parsed.success) return { skus: parsed.data.skus, rationale: parsed.data.rationale };
    }
  }
  return { skus: null, rationale: "" };
}

export async function fixedPrompt(question: string) {
  const chunks = await hybridSearch(question, FIXED_TOP_K);
  return {
    chunks,
    prompt: `检索片段（混合检索 top${FIXED_TOP_K}）：\n${formatChunks(chunks)}\n\n问题：${question}\n请只根据以上片段，调用 answer 提交答案。`,
  };
}

/** fixed：一次混合检索 top-k=8 + 一次生成（强制调用 answer 输出结构化答案，只有 1 步）。 */
export function fixedSettings() {
  return {
    system: SYSTEM_PROMPT,
    tools: { answer: answerTool },
    toolChoice: { type: "tool", toolName: "answer" } as const,
    stopWhen: isStepCount(1),
  };
}

/** agentic：search / filterProducts / answer 工具循环，第 1 步强制 search。 */
export function agenticSettings() {
  return {
    system:
      SYSTEM_PROMPT +
      "\n你可以多次调用 search 和 filterProducts 收集证据（例如先 search 找到参照商品，再 filterProducts 按属性比较），最后必须调用 answer。最多 6 步。",
    tools: agenticTools(),
    stopWhen: [isStepCount(AGENTIC_MAX_STEPS), hasToolCall("answer")],
    prepareStep: ({ stepNumber }: { stepNumber: number }) =>
      stepNumber === 0 ? { toolChoice: { type: "tool" as const, toolName: "search" as const } } : undefined,
  };
}

function finish(
  pipeline: RunResult["pipeline"],
  steps: StepResult<ToolSet>[],
  t0: number,
  usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number },
  warnings: string[],
): RunResult {
  const { skus, rationale } = extractAnswer(steps);
  return {
    pipeline,
    answer: skus,
    rationale,
    steps: traceSteps(steps),
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    totalTokens: usage.totalTokens ?? (usage.inputTokens ?? 0) + (usage.outputTokens ?? 0),
    latencyMs: Date.now() - t0,
    finishReason: steps.at(-1)?.finishReason ?? "none",
    warnings,
  };
}

const warningText = (steps: StepResult<ToolSet>[]) =>
  steps.flatMap((s) => (s.warnings ?? []).map((w) => JSON.stringify(w)));

export async function runFixed(model: LanguageModel, question: string): Promise<RunResult> {
  const t0 = Date.now();
  const { prompt } = await fixedPrompt(question);
  const r = await generateText({ model, prompt, ...fixedSettings(), maxRetries: LLM_MAX_RETRIES });
  const steps = r.steps as unknown as StepResult<ToolSet>[];
  return finish("fixed", steps, t0, r.totalUsage, warningText(steps));
}

export async function runAgentic(model: LanguageModel, question: string): Promise<RunResult> {
  const t0 = Date.now();
  const r = await generateText({ model, prompt: `问题：${question}`, ...agenticSettings(), maxRetries: LLM_MAX_RETRIES });
  const steps = r.steps as unknown as StepResult<ToolSet>[];
  return finish("agentic", steps, t0, r.totalUsage, warningText(steps));
}

/** 页面用的流式版本：返回 streamText 结果，由路由转成 NDJSON 事件。 */
export async function streamPipeline(model: LanguageModel, pipeline: "fixed" | "agentic", question: string) {
  if (pipeline === "fixed") {
    const { prompt, chunks } = await fixedPrompt(question);
    return { retrieved: chunks.map((c) => c.id), result: streamText({ model, prompt, ...fixedSettings(), maxRetries: LLM_MAX_RETRIES }) };
  }
  return { retrieved: [] as string[], result: streamText({ model, prompt: `问题：${question}`, ...agenticSettings(), maxRetries: LLM_MAX_RETRIES }) };
}
