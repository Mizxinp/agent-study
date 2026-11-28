import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { WorkflowAgent } from '@ai-sdk/workflow';
import { generateText, streamText, ToolLoopAgent } from 'ai';
import { afterAll, expect, test, vi } from 'vitest';
import { prompt, scriptedModel, tools } from '../lib/scripted-model';

const defaultWarning = 'The tool loop stopped because it reached the default stopWhen condition, isStepCount(20). To allow more steps, set stopWhen to isStepCount(...) with a higher limit or provide a custom stop condition. Learn more: https://ai-sdk.dev/docs/agents/loop-control';

type Observation = {
  calls: ReturnType<typeof scriptedModel>['calls'];
  warnings: string[];
  steps?: number;
  error?: string;
  typeDiagnostics?: string[];
  constructed?: boolean;
  stopWhenPresent?: boolean;
  preparedOrder?: readonly string[];
  observedSteps?: number[];
  aborted?: boolean;
};
const observations: Record<string, Observation> = {};

afterAll(() => {
  mkdirSync('results', { recursive: true });
  writeFileSync('results/observations.json', JSON.stringify(observations, null, 2) + '\n');
});

for (const mode of ['generate', 'stream'] as const) {
  for (const natural of [false, true]) {
    test(`H1/H5 ToolLoopAgent ${mode}, natural=${natural}`, async () => {
      const { model, calls } = scriptedModel(natural ? 20 : Infinity);
      const evidence: Observation = { calls, warnings: [] };
      observations[`loop-${mode}-${natural ? 'natural' : 'limit'}`] = evidence;
      const agent = new ToolLoopAgent({
        model,
        tools,
        onWarning: ({ warnings }) => {
          for (const warning of warnings) {
            if ('message' in warning) evidence.warnings.push(warning.message);
          }
        },
      });
      const result = mode === 'stream' ? await agent.stream({ prompt }) : await agent.generate({ prompt });
      if ('consumeStream' in result) await result.consumeStream();
      evidence.steps = (await result.steps).length;
      expect(evidence.steps).toBe(20);
      expect(calls).toHaveLength(20);
      expect(calls.at(-1)?.finishReason).toBe(natural ? 'stop' : 'tool-calls');
      expect(evidence.warnings).toEqual(natural ? [] : [defaultWarning]);
      expect(calls.every(call => call.userAgent?.includes('ai-sdk-agent/tool-loop'))).toBe(true);
    });
  }

  test(`H2 bare ${mode}`, async () => {
    const { model, calls } = scriptedModel();
    const evidence: Observation = { calls, warnings: [] };
    observations[`bare-${mode}`] = evidence;
    const options = { model, tools, prompt };
    const result = mode === 'stream' ? streamText(options) : await generateText(options);
    if ('consumeStream' in result) await result.consumeStream();
    evidence.steps = (await result.steps).length;
    expect(evidence.steps).toBe(1);
    expect(calls).toHaveLength(1);
  });
}

async function workflowProbe(mode: 'generate' | 'stream', order?: (keyof typeof tools)[]) {
  const { model, calls } = scriptedModel();
  const evidence: Observation = { calls, warnings: [], observedSteps: [] };
  observations[order ? 'workflow-reordered' : `workflow-${mode}`] = evidence;
  const warning = vi.spyOn(process, 'emitWarning').mockImplementation((...args) => {
    evidence.warnings.push(String(args[0]));
  });
  const controller = new AbortController();
  try {
    const agent = new WorkflowAgent({
      model,
      tools,
      toolOrder: order,
      prepareCall: options => {
        evidence.stopWhenPresent = options.stopWhen != null;
        evidence.preparedOrder = options.toolOrder ? [...options.toolOrder] : undefined;
        return {};
      },
    });
    const options = {
      prompt,
      abortSignal: controller.signal,
      maxRetries: 0,
      timeout: 3000,
      onStepEnd: () => {
        evidence.observedSteps?.push(calls.length);
        if (calls.length === 25) controller.abort();
      },
    };
    const result = mode === 'generate'
      ? await agent.generate(options)
      : await agent.stream({ ...options, writable: new WritableStream() });
    evidence.steps = result.steps.length;
  } catch (error) {
    evidence.error = String(error);
  } finally {
    evidence.aborted = controller.signal.aborted;
    warning.mockRestore();
  }
  return evidence;
}

test('H3/H5/H6 WorkflowAgent generate, stream and toolOrder', async () => {
  const generated = await workflowProbe('generate');
  const streamed = await workflowProbe('stream');
  const reordered = await workflowProbe('generate', ['beta', 'alpha']);
  expect(generated.stopWhenPresent).toBe(true);
  expect(streamed.stopWhenPresent).toBe(false);
  expect(reordered.preparedOrder).toEqual(['beta', 'alpha']);

  for (const run of [generated, streamed, reordered]) {
    if (run.calls.length) {
      expect(run.calls.every(call => call.userAgent?.includes('ai-sdk-agent/workflow'))).toBe(true);
    } else {
      expect(run.error).toBeTruthy();
    }
  }
  if (!generated.error) {
    expect(generated.steps).toBe(20);
    expect(generated.warnings.some(message => message.includes(defaultWarning))).toBe(true);
  }
  if (streamed.aborted || !streamed.error) {
    expect(streamed.observedSteps?.slice(19, 22)).toEqual([20, 21, 22]);
    expect(streamed.calls).toHaveLength(25);
    expect(streamed.aborted).toBe(true);
  }
  if (reordered.calls.length) {
    expect(generated.calls[0].toolOrder).toEqual(['alpha', 'beta']);
    expect(reordered.calls[0].toolOrder).toEqual(['beta', 'alpha']);
  }
});

test('H7 ToolLoopAgent accepts a local fixture string and executes', async () => {
  const { model, calls } = scriptedModel(1);
  const evidence: Observation = { calls, warnings: [] };
  observations['approval-tool-loop'] = evidence;
  const agent = new ToolLoopAgent({ model, experimental_toolApprovalSecret: 'local-fixture-only' });
  evidence.steps = (await agent.generate({ prompt })).steps.length;
  expect(evidence.steps).toBe(1);
});

test('H4/H7 compile the positive and negative interface examples', () => {
  const compiler = spawnSync(process.execPath, [
    'node_modules/typescript/bin/tsc',
    '--project', 'tests/tsconfig.negative.json',
    '--pretty', 'false',
  ], { encoding: 'utf8' });
  const diagnostics = compiler.stdout.trim().split(/\n(?=tests\/interfaces\.negative\.ts\()/);
  observations['interfaces'] = { calls: [], warnings: [], typeDiagnostics: diagnostics };
  expect(compiler.status, compiler.stderr).toBe(1);
  expect(diagnostics).toHaveLength(2);
  expect(diagnostics[0]).toMatch(/error TS2741: Property 'version' is missing in type 'WorkflowAgent.*required in type 'Agent/);
  expect(diagnostics[1]).toContain("error TS2322: Type 'string' is not assignable to type 'WorkflowToolApprovalSecret'.");
});

test('H7 WorkflowAgent can be constructed with an environment variable reference', () => {
  const { model, calls } = scriptedModel(1);
  const agent = new WorkflowAgent({
    model,
    experimental_toolApprovalSecret: { environmentVariable: 'DEMO_APPROVAL_FIXTURE' },
  });
  const constructed = agent instanceof WorkflowAgent;
  observations['approval-workflow'] = { calls, warnings: [], constructed };
  expect(constructed).toBe(true);
});
