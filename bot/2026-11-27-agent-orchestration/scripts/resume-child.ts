import { RunState, run } from '@openai/agents';
import { readFile } from 'node:fs/promises';
import { finishNested } from '../lib/resume';

const [, , path, dir] = process.argv;
const graph = finishNested(dir);
const state = await RunState.fromString(graph.manager, await readFile(path, 'utf8'));
state.approve(state.getInterruptions()[0]);
const result = await run(graph.manager, state);
console.log(JSON.stringify({
  managerCalls: graph.models.manager.calls.length,
  refundCalls: graph.models.refund.calls.length,
  finalOutput: result.finalOutput,
  interruptions: result.interruptions.length,
}));
