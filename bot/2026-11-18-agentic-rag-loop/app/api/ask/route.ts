import { parseAskBody, validateAskInput } from "../../../lib/ask-input";
import { streamPipeline } from "../../../lib/pipelines";
import { createLlm, resolveLlmConfig } from "../../../lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const brief = (v: unknown) => {
  const s = JSON.stringify(v);
  return s && s.length > 300 ? s.slice(0, 300) + "…" : s;
};

/** POST { question, pipeline: "fixed" | "agentic" } → NDJSON 流：每步工具调用、结果摘要、文本增量与最终答案。 */
export async function POST(request: Request) {
  const input = validateAskInput(parseAskBody(await request.text()));
  if (!input.ok) return Response.json({ error: input.error }, { status: input.status });
  const cfg = resolveLlmConfig();
  if (!cfg.ok) return Response.json({ error: `LLM 未配置：${cfg.reason}` }, { status: 503 });
  const { question, pipeline } = input.value;
  const { model, modelId } = createLlm();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      const t0 = Date.now();
      try {
        send({ type: "start", pipeline, modelId });
        const { retrieved, result } = await streamPipeline(model, pipeline, question);
        if (retrieved.length) send({ type: "retrieved", ids: retrieved });
        let step = 0;
        for await (const part of result.fullStream) {
          if (part.type === "start-step") send({ type: "step-start", step: ++step });
          else if (part.type === "tool-call") {
            send({ type: "tool-call", step, toolName: part.toolName, input: part.input });
            if (part.toolName === "answer") send({ type: "answer", step, ...(part.input as object) });
          } else if (part.type === "tool-result") send({ type: "tool-result", step, toolName: part.toolName, output: brief(part.output) });
          else if (part.type === "tool-error") send({ type: "tool-error", step, toolName: part.toolName, error: String(part.error) });
          else if (part.type === "text-delta") send({ type: "text", step, text: part.text });
          else if (part.type === "finish-step") send({ type: "step-finish", step, finishReason: part.finishReason, usage: part.usage });
          else if (part.type === "finish") send({ type: "finish", finishReason: part.finishReason, usage: part.totalUsage, latencyMs: Date.now() - t0 });
          else if (part.type === "error") send({ type: "error", error: String(part.error) });
        }
      } catch (e) {
        send({ type: "error", error: String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
}
