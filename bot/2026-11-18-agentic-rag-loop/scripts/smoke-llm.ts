import { createLlm } from "../lib/providers";
import { runAgentic, runFixed } from "../lib/pipelines";
import { questions } from "../lib/data";
const { model, modelId, baseHost } = createLlm();
console.log("model", modelId, "host", baseHost);
for (const id of (process.argv[2] ?? "m01").split(",")) {
  const q = questions.find((x) => x.id === id)!;
  for (const run of [runFixed, runAgentic]) {
    try {
      const r = await run(model, q.question);
      console.log(id, r.pipeline, "gold", q.gold, "pred", r.answer, r.latencyMs + "ms", r.totalTokens, "tok", r.steps.length, "steps");
      for (const s of r.steps) console.log("   ", s.step, s.finishReason, JSON.stringify(s.toolCalls), s.toolResults.map((t) => t.summary.slice(0, 80)));
      if (r.warnings.length) console.log("   warnings", r.warnings);
    } catch (e) {
      console.log(id, "ERROR", String(e).slice(0, 400));
    }
  }
}
