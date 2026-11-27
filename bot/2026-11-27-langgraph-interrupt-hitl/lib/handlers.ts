import { Command, INTERRUPT, isInterrupted } from "@langchain/langgraph";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { approval, refundGraph, refundInput } from "./refund";

type Decision = { owner: string } & (
  | { consumed: false; threadId: string; graph: ReturnType<typeof refundGraph> }
  | { consumed: true }
);

const runtime = globalThis as typeof globalThis & {
  refundDemoDecisions?: Map<string, Decision>;
};
const decisions = runtime.refundDemoDecisions ??= new Map();
const approvalInput = approval.extend({ decisionId: z.uuid() });
const error = (message: string, status: number) => Response.json({ error: message }, { status });

export async function chat(request: Request) {
  const owner = request.headers.get("x-demo-user");
  if (!owner) return error("缺少演示用户", 403);
  const body = refundInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return error("退款参数无效", 400);

  const decisionId = randomUUID();
  const threadId = randomUUID();
  const graph = refundGraph(process.env.REFUND_DATA_DIR ?? ".data");
  const result = await graph.invoke({ refund: body.data, decisionId }, {
    configurable: { thread_id: threadId },
  });
  if (!isInterrupted(result) || result[INTERRUPT].length !== 1) {
    throw new Error("每笔退款必须出现一次审批中断");
  }
  decisions.set(decisionId, { owner, threadId, graph, consumed: false });
  const { value, response_schema } = result[INTERRUPT][0];
  return Response.json({ decisionId, refund: body.data, __interrupt__: [{ value, response_schema }] });
}

export async function approve(request: Request) {
  const owner = request.headers.get("x-demo-user");
  if (!owner) return error("缺少演示用户", 403);
  const body = approvalInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return error("审批参数无效", 400);
  const { decisionId, approved, note } = body.data;
  const pending = decisions.get(decisionId);
  if (!pending) return error("未找到审批", 404);
  if (pending.owner !== owner) return error("用户不匹配", 403);
  if (pending.consumed) return error("审批已消费", 409);

  // 同一 Node.js 进程内，检查和领取之间没有异步让步。
  decisions.set(decisionId, { owner, consumed: true });
  const result = await pending.graph.invoke(new Command({ resume: { approved, note } }), {
    configurable: { thread_id: pending.threadId },
  });
  if (!result.status || isInterrupted(result)) {
    throw new Error("审批恢复未完成");
  }
  return Response.json({ decisionId, status: result.status });
}
