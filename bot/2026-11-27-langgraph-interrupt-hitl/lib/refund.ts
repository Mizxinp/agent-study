import { Annotation, END, interrupt, MemorySaver, START, StateGraph } from "@langchain/langgraph";
import { appendFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const refundInput = z.object({
  order: z.string().trim().min(1).max(80),
  amount: z.number().int().positive().max(1_000_000),
});

export const approval = z.object({ approved: z.boolean(), note: z.string().max(500).default("") });

type Refund = z.infer<typeof refundInput>;
const State = Annotation.Root({
  refund: Annotation<Refund>(),
  decisionId: Annotation<string>(),
  status: Annotation<"approved" | "rejected">(),
});

export function refundGraph(dir: string, counts = { before: 0, after: 0 }) {
  return new StateGraph(State)
    .addNode("approval", async ({ refund, decisionId }) => {
      counts.before += 1;
      const { approved, note } = interrupt(
        { question: "店长是否批准这笔退款？", ...refund },
        { responseSchema: approval },
      );
      if (!approved) return { status: "rejected" as const };
      await mkdir(dir, { recursive: true });
      await appendFile(join(dir, "ledger.jsonl"), JSON.stringify({ decisionId, ...refund, note }) + "\n");
      counts.after += 1;
      return { status: "approved" as const };
    })
    .addEdge(START, "approval")
    .addEdge("approval", END)
    .compile({ checkpointer: new MemorySaver() });
}
