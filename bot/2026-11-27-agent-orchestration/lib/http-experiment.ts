import { RunState, run } from '@openai/agents';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { POST as chat } from '../app/api/support/chat/route';
import { POST as approve } from '../app/api/support/approve/route';
import { buildGraph, call, ledger, orderId, step } from './fixtures';
import { withData } from './resume';
import { check } from './results';

const request = (path: string, user: string, body: object) =>
  new Request('http://localhost/api/support/' + path, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-demo-user': user }, body: JSON.stringify(body),
  });

export async function h10() {
  return withData(async dir => {
    const previous = process.env.ORCHESTRATION_DEMO_DATA_DIR;
    process.env.ORCHESTRATION_DEMO_DATA_DIR = dir;
    try {
      const pending = await chat(request('chat', 'owner', { message: '请为 ORD-1001 退款' }));
      const payload = await pending.json();
      const { runId, approvals } = payload;
      const { decisionId, toolName, argsSummary } = approvals[0];
      const clientGraph = buildGraph({
        triage: [step(call('transfer_to_refund_agent'))],
        refund: [step(call('issue_refund', { orderId, amount: 9999 }))],
      }, dir);
      const clientRun = await run(clientGraph.triage, '请为 ORD-1001 退款');
      const snapshot = clientRun.state.toString();
      const restored = await RunState.fromString(clientGraph.triage, snapshot);
      const clientInterruptions = restored.getInterruptions();
      const clientTool = clientInterruptions[0]?.rawItem;
      const clientState = {
        parsed: true,
        interruptions: clientInterruptions.length,
        toolName: clientTool?.type === 'function_call' ? clientTool.name : undefined,
        amount: clientTool?.type === 'function_call' ? JSON.parse(clientTool.arguments).amount : undefined,
      };
      const body = { runId, decisionId, approved: true, user: 'owner', state: snapshot };
      const outsider = await approve(request('approve', 'other-user', body));
      const invalid = await approve(request('approve', 'owner', { ...body, decisionId: randomUUID() }));
      const before = (await ledger(dir).rows()).length;
      const results = await Promise.all([approve(request('approve', 'owner', body)), approve(request('approve', 'owner', body))]);
      const statuses = results.map(result => result.status).sort();
      const final = await results.find(result => result.status === 200)?.json();
      const after = await ledger(dir).rows();
      const clientStateWasIgnored = final?.finalOutput === '退款已批准' &&
        after.length === 1 && after[0].orderId === orderId && after[0].amount === 100;
      const repeat = await approve(request('approve', 'owner', body));
      const repeatedRows = (await ledger(dir).rows()).length;
      const denied = await chat(request('chat', 'owner', { message: '请退款' }));
      const deniedPayload = await denied.json();
      const reject = await approve(request('approve', 'owner', {
        runId: deniedPayload.runId, decisionId: deniedPayload.approvals[0].decisionId, approved: false,
      }));
      const rejection = await reject.json();
      const afterReject = (await ledger(dir).rows()).length;
      return [
        check('H10.chat', pending.status === 200 && !('state' in payload) && approvals.length === 1 &&
          before === 0 && toolName === 'issue_refund' && JSON.parse(argsSummary).amount === 100,
        { status: pending.status, keys: Object.keys(payload), approvals: approvals.length, toolName, argsSummary, ledgerRows: before }),
        check('H10.identity', outsider.status === 403 && invalid.status === 404, { otherUser: outsider.status, unrelatedDecision: invalid.status }),
        check('H10.approve', clientState.parsed && clientState.interruptions === 1 &&
          clientState.toolName === 'issue_refund' && clientState.amount === 9999 && clientStateWasIgnored,
        { final, ledgerRows: after.length, amount: after[0]?.amount, clientState, clientStateWasIgnored }),
        check('H10.replay', JSON.stringify(statuses) === '[200,409]' && repeat.status === 409 && repeatedRows === 1,
          { concurrentStatuses: statuses, replayStatus: repeat.status, ledgerRows: repeatedRows }),
        check('H10.reject', reject.status === 200 && rejection.finalOutput === '退款未批准' && afterReject === 1,
          { status: reject.status, final: rejection, ledgerRows: afterReject }),
      ];
    } finally {
      if (previous === undefined) delete process.env.ORCHESTRATION_DEMO_DATA_DIR;
      else process.env.ORCHESTRATION_DEMO_DATA_DIR = previous;
    }
  });
}

export function buildObservation() {
  const result = spawnSync('pnpm', ['build'], {
    encoding: 'utf8', env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });
  if (result.stdout) process.stderr.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return check('H10.build', result.status === 0, { exitCode: result.status });
}
