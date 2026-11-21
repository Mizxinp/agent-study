/** 纯函数：校验 POST /api/ask 的请求体，不加载模型、不需要密钥。 */
export type AskInput = { question: string; pipeline: "fixed" | "agentic" };
export const EMPTY_ASK_ERROR = "请求为空：请提供 question（问题文本），pipeline 可选 fixed 或 agentic";
export const MAX_QUESTION_CHARS = 500;

export function parseAskBody(text: string): unknown {
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function validateAskInput(raw: unknown): { ok: true; value: AskInput } | { ok: false; status: 400; error: string } {
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const question = typeof obj.question === "string" ? obj.question.trim() : "";
  if (!question) return { ok: false, status: 400, error: EMPTY_ASK_ERROR };
  if (question.length > MAX_QUESTION_CHARS) return { ok: false, status: 400, error: `问题最多 ${MAX_QUESTION_CHARS} 字符` };
  const p = obj.pipeline ?? "agentic";
  if (p !== "fixed" && p !== "agentic") return { ok: false, status: 400, error: "pipeline 只能是 fixed 或 agentic" };
  return { ok: true, value: { question, pipeline: p } };
}
