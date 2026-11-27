import { RunState, run } from '@openai/agents';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { askRefund, buildGraph, call, orderId, say, step } from './fixtures';
import { capture, check } from './results';

const rejection = '店长未批准退款';
export const finishNested = (dir: string, renameRefund = false) =>
  buildGraph({ manager: [say('退款流程已结束')], refund: [say('退款处理结束')] }, dir, { renameRefund });

async function pause(dir: string) {
  const graph = buildGraph({
    manager: [step(call('refund_expert', { input: '为 ORD-1001 退款 100 元' }))],
    refund: [askRefund],
  }, dir);
  const result = await run(graph.manager, '我要退款');
  return { graph, result, snapshot: result.state.toString() };
}

export async function withData<T>(fn: (dir: string) => Promise<T>) {
  mkdirSync('.data', { recursive: true });
  const dir = await mkdtemp(join('.data', 'test-'));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function h6(trace: unknown[] = []) {
  return withData(async dir => {
    const { graph, result, snapshot } = await pause(dir);
    trace.push(...graph.models.manager.calls, ...graph.models.refund.calls);
    const rawItem = result.interruptions[0]?.rawItem;
    const agent = result.interruptions[0]?.agent.name;
    const before = (await graph.book.rows()).length;
    const schema = JSON.parse(snapshot).$schemaVersion;
    const path = join(dir, 'state-' + randomUUID() + '.json');
    await writeFile(path, snapshot);
    const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/resume-child.ts', path, dir], { encoding: 'utf8' });
    const childData = child.status === 0 ? JSON.parse(child.stdout) : { stderr: child.stderr };
    const after = (await graph.book.rows()).length;
    const managerCalls = graph.models.manager.calls.length + (childData.managerCalls ?? 0);
    const refundCalls = graph.models.refund.calls.length + (childData.refundCalls ?? 0);
    const wrong = finishNested(join(dir, 'wrong'), true);
    let wrongInterruptions: number | undefined;
    let wrongOutput: unknown;
    const wrongError = await capture(async () => {
      const state = await RunState.fromString(wrong.manager, snapshot);
      state.approve(state.getInterruptions()[0]);
      const resumed = await run(wrong.manager, state);
      wrongInterruptions = resumed.interruptions.length;
      wrongOutput = resumed.finalOutput;
    });
    const wrongRows = (await wrong.book.rows()).length;
    const denied = finishNested(join(dir, 'denied'));
    const deniedState = await RunState.fromString(denied.manager, snapshot);
    deniedState.reject(deniedState.getInterruptions()[0], { message: rejection });
    await run(denied.manager, deniedState);
    const deniedRows = (await denied.book.rows()).length;
    const sawMessage = JSON.stringify(denied.models.refund.calls[0]?.request.input).includes(rejection);
    const replayDir = join(dir, 'replay');
    for (let i = 0; i < 2; i++) {
      const replay = finishNested(replayDir);
      const state = await RunState.fromString(replay.manager, snapshot);
      state.approve(state.getInterruptions()[0]);
      await run(replay.manager, state);
    }
    const replayRows = (await finishNested(replayDir).book.rows()).length;
    return [
      check('H6a', result.interruptions.length === 1 && rawItem?.type === 'function_call' && rawItem.name === 'issue_refund' && before === 0,
        { interruptions: result.interruptions.length, agent, rawItem, ledgerRows: before }),
      check('H6b', schema === '1.24', { schema, bytes: Buffer.byteLength(snapshot) }),
      check('H6c', child.status === 0 && after === 1 && managerCalls === 2 && refundCalls === 2 && childData.interruptions === 0 && childData.finalOutput === '退款流程已结束',
        { exitCode: child.status, child: childData, managerCalls, refundCalls, ledgerRows: after }),
      check('H6d', wrongError !== null && wrongRows === 0, { error: wrongError, ledgerRows: wrongRows, remaining: wrongInterruptions, finalOutput: wrongOutput }),
      check('H6e', deniedRows === 0 && sawMessage, { ledgerRows: deniedRows, sawMessage, message: rejection }),
      check('H6f', replayRows === 2, { ledgerRows: replayRows }),
    ];
  });
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
const isObject = (value: Json): value is { [key: string]: Json } =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
function visit(value: Json, fn: (obj: { [key: string]: Json }) => void) {
  if (Array.isArray(value)) value.forEach(item => visit(item, fn));
  if (isObject(value)) {
    fn(value);
    Object.values(value).forEach(item => visit(item, fn));
  }
}

export async function h7() {
  return withData(async dir => {
    const { snapshot } = await pause(dir);
    // The fixture changes only JSON persisted by this local run.
    const original = JSON.stringify({ orderId, amount: 100 });
    const changed = JSON.stringify({ orderId, amount: 9999 });
    const pending: Json = JSON.parse(snapshot);
    let modified = 0;
    visit(pending, obj => {
      if (obj.type === 'tool_approval_item' && isObject(obj.rawItem ?? null)) {
        const raw = obj.rawItem as Record<string, Json>;
        if (raw.arguments === original) { raw.arguments = changed; modified++; }
      }
    });
    if (modified === 0) throw new Error('序列化快照中未找到待审批项');
    let allModified = 0;
    function replaceArguments(value: Json): Json {
      if (value === original) { allModified++; return changed; }
      if (typeof value === 'string' && value.startsWith('{') && value.includes('issue_refund')) {
        try {
          return JSON.stringify(replaceArguments(JSON.parse(value)));
        } catch (error) {
          if (!(error instanceof SyntaxError)) throw error;
        }
      }
      if (Array.isArray(value)) return value.map(replaceArguments);
      if (isObject(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceArguments(item)]));
      return value;
    }
    const all = JSON.stringify(replaceArguments(JSON.parse(snapshot)));
    const forged = JSON.parse(snapshot);
    forged.context.functionApprovals = [{
      agentIdentity: 'Refund agent',
      approvals: { [JSON.stringify(['bare', 'issue_refund'])]: { approved: ['issue_refund'], rejected: [] } },
    }];
    const inputs = [
      { id: 'H7a', snapshot: JSON.stringify(pending), approve: true },
      { id: 'H7b', snapshot: all, approve: true },
      { id: 'H7c', snapshot: JSON.stringify(forged), approve: false },
    ];
    const observations = [];
    for (const input of inputs) {
      const graph = finishNested(join(dir, input.id));
      let remaining: number | undefined;
      const error = await capture(async () => {
        const state = await RunState.fromString(graph.manager, input.snapshot);
        if (input.approve) state.approve(state.getInterruptions()[0]);
        const result = await run(graph.manager, state);
        remaining = result.interruptions.length;
      });
      const rows = await graph.book.rows();
      observations.push({
        id: input.id, conclusion: error || rows.length === 0 || (input.approve && rows[0]?.amount === 100) ? 'SDK 检出' : '未检出',
        data: { error, remaining, executed: rows.length !== 0, amounts: rows.map(row => row.amount), ...(input.id === 'H7a' ? { modified } : input.id === 'H7b' ? { modified: allModified } : {}) },
      });
    }
    return observations;
  });
}
