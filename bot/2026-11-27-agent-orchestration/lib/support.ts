import { RunState, run } from '@openai/agents';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { askRefund, buildGraph, call, say, step } from './fixtures';

const uuid = z.uuid();
const approvalInput = z.object({ runId: uuid, decisionId: uuid, approved: z.boolean() });
const chatInput = z.object({ message: z.string().trim().min(1) });

type Pending = {
  user: string;
  decisionId: string;
  state: string;
};
const fileAbsent = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';

export async function chat(request: Request, dir = '.data') {
  const owner = request.headers.get('x-demo-user');
  if (!owner) return Response.json({ error: '缺少演示用户' }, { status: 403 });
  const body = chatInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: '消息无效' }, { status: 400 });
  const graph = buildGraph({ triage: [step(call('transfer_to_refund_agent'))], refund: [askRefund] }, dir);
  const result = await run(graph.triage, body.data.message);
  const interruption = result.interruptions[0];
  if (result.interruptions.length !== 1 || interruption.rawItem.type !== 'function_call') {
    throw new Error('演示脚本应只发起一笔退款');
  }
  const runId = randomUUID();
  const decisionId = randomUUID();
  const pending: Pending = { user: owner, decisionId, state: result.state.toString() };
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'state-' + runId + '.json'), JSON.stringify(pending), { flag: 'wx' });
  return Response.json({ runId, approvals: [{ decisionId, toolName: interruption.rawItem.name, argsSummary: interruption.rawItem.arguments }] });
}

export async function approve(request: Request, dir = '.data') {
  const owner = request.headers.get('x-demo-user');
  if (!owner) return Response.json({ error: '缺少演示用户' }, { status: 403 });
  const body = approvalInput.safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: '审批参数无效' }, { status: 400 });
  const { runId, decisionId, approved } = body.data;
  const path = join(dir, 'state-' + runId + '.json');
  const consumed = join(dir, 'consumed-' + runId + '.json');
  let pending: Pending;
  try {
    pending = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (!fileAbsent(error)) throw error;
    try {
      await readFile(consumed, 'utf8');
      return Response.json({ error: '审批已消费' }, { status: 409 });
    } catch (readError) {
      if (!fileAbsent(readError)) throw readError;
      return Response.json({ error: '未找到审批' }, { status: 404 });
    }
  }
  if (pending.user !== owner) return Response.json({ error: '用户不匹配' }, { status: 403 });
  if (pending.decisionId !== decisionId) return Response.json({ error: '审批与运行不匹配' }, { status: 404 });
  try {
    await rename(path, consumed);
  } catch (error) {
    if (!fileAbsent(error)) throw error;
    return Response.json({ error: '审批已消费' }, { status: 409 });
  }
  const graph = buildGraph({ refund: [say(approved ? '退款已批准' : '退款未批准')] }, dir);
  const state = await RunState.fromString(graph.triage, pending.state);
  const interruption = state.getInterruptions()[0];
  if (approved) state.approve(interruption);
  else state.reject(interruption, { message: '店长未批准' });
  const result = await run(graph.triage, state);
  return Response.json({ finalOutput: result.finalOutput });
}
