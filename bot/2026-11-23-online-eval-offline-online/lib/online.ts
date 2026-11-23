export type ToolResult = { toolName: string; summary?: string; error?: boolean };
export type Step = {
  step: number;
  finishReason: string;
  toolCalls: readonly { toolName: string; input: unknown }[];
  toolResults: readonly ToolResult[];
};

export type OnlineTrace = {
  answer: readonly string[] | null;
  steps: readonly Step[];
  gold?: never;
  correct?: never;
  f1?: never;
};

export const rules = {
  skuSet: (trace: OnlineTrace) =>
    trace.answer !== null &&
    trace.answer.every((sku) => /^DH-[A-Z]{2}-[0-9]{4}$/u.test(sku)) &&
    new Set(trace.answer).size === trace.answer.length,
  noToolError: (trace: OnlineTrace) =>
    trace.steps.every((step) => step.toolResults.every((result) => result.error !== true)),
};

export const hasSearchCall = (step: Step | undefined) =>
  step?.toolCalls.some((call) => call.toolName === "search") === true;

export const hasSearchResult = (step: Step | undefined) =>
  step?.toolResults.some((result) =>
    result.toolName === "search" && result.error !== true && !!result.summary?.trim(),
  ) === true;
