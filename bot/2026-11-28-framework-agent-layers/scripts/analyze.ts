import { readFileSync, writeFileSync } from 'node:fs';

type Evidence = {
  calls: { step: number; userAgent: string | null; toolOrder: string[]; finishReason: string }[];
  warnings: string[];
  steps?: number;
  error?: string;
  observedSteps?: number[];
  aborted?: boolean;
  preparedOrder?: string[];
  stopWhenPresent?: boolean;
  typeDiagnostics?: string[];
  constructed?: boolean;
};

const observations = JSON.parse(readFileSync('results/observations.json', 'utf8')) as Record<string, Evidence>;
const runs = (prefix: string, suffix = '') => ['generate', 'stream'].map(mode => observations[prefix + mode + suffix]);
const toolLoop = runs('loop-', '-limit');
const natural = runs('loop-', '-natural');
const bare = runs('bare-');
const workflow = runs('workflow-');
const [generated, streamed] = workflow;
const reordered = observations['workflow-reordered'];
const [agentDiagnostic, secretDiagnostic] = observations.interfaces.typeDiagnostics ?? [];
const approvalToolLoop = observations['approval-tool-loop'];
const approvalWorkflow = observations['approval-workflow'];

const limitWarning = (run: Evidence) => run.warnings.some(message => message.includes('isStepCount(20)'));
const stepCount = (run: Evidence, count: number) => run.steps === count && run.calls.length === count;
const headers = (run: Evidence) => [...new Set(run.calls.map(call => call.userAgent))];
const tagged = (run: Evidence, tag: string) =>
  run.calls.length > 0 && run.calls.every(call => call.userAgent?.includes(tag));
const order = (run: Evidence) => run.calls[0]?.toolOrder ?? null;
const conclusion = (ok: boolean) => ok ? '支持' : '不支持';
const workflowLimit = generated.stopWhenPresent === true && stepCount(generated, 20) && limitWarning(generated);
const workflowContinued = streamed.stopWhenPresent === false &&
  streamed.observedSteps?.slice(19).join(',') === '20,21,22,23,24,25' &&
  streamed.calls.length === 25 && streamed.aborted;

const summary = {
  H1: {
    conclusion: conclusion(toolLoop.every(run => stepCount(run, 20) && limitWarning(run) &&
      run.calls.at(-1)?.finishReason === 'tool-calls') &&
      natural.every(run => stepCount(run, 20) && run.warnings.length === 0 &&
        run.calls.at(-1)?.finishReason === 'stop')),
    steps: toolLoop.map(run => run.steps),
    warnings: toolLoop.map(run => run.warnings),
    naturalSteps: natural.map(run => run.steps),
    naturalWarnings: natural.map(run => run.warnings),
  },
  H2: {
    conclusion: conclusion(bare.every(run => stepCount(run, 1))),
    steps: bare.map(run => run.steps),
  },
  H3: {
    conclusion: !workflowLimit && generated.error || !workflowContinued && streamed.error
      ? '无法运行' : conclusion(Boolean(workflowLimit && workflowContinued)),
    steps: workflow.map(run => run.steps ?? null),
    streamObservedSteps: streamed.observedSteps,
    streamAborted: streamed.aborted,
    warnings: workflow.map(run => run.warnings),
    errors: workflow.map(run => run.error ?? null),
    preparedStopWhen: workflow.map(run => run.stopWhenPresent),
  },
  H4: {
    conclusion: conclusion(Boolean(agentDiagnostic?.includes('TS2741'))),
    diagnostic: agentDiagnostic,
  },
  H5: {
    conclusion: workflow.some(run => !run.calls.length && run.error) ? 'Workflow 侧无法运行'
      : conclusion(toolLoop.every(run => tagged(run, 'ai-sdk-agent/tool-loop')) &&
          workflow.every(run => tagged(run, 'ai-sdk-agent/workflow'))),
    toolLoopConclusion: conclusion(toolLoop.every(run => tagged(run, 'ai-sdk-agent/tool-loop'))),
    toolLoop: toolLoop.map(headers),
    workflow: workflow.map(headers),
  },
  H6: {
    conclusion: reordered.error && !reordered.calls.length ? '无法运行'
      : conclusion(order(generated)?.join(',') === 'alpha,beta' && order(reordered)?.join(',') === 'beta,alpha'),
    defaultOrder: order(generated),
    modelOrder: order(reordered),
    preparedOrder: reordered.preparedOrder,
    error: reordered.error ?? null,
  },
  H7: {
    conclusion: conclusion(stepCount(approvalToolLoop, 1) && approvalWorkflow.constructed === true &&
      Boolean(secretDiagnostic?.includes("Type 'string' is not assignable to type 'WorkflowToolApprovalSecret'"))),
    toolLoopSteps: approvalToolLoop.steps,
    workflowConstructed: approvalWorkflow.constructed,
    diagnostic: secretDiagnostic,
  },
};

writeFileSync('results/summary.json', JSON.stringify(summary, null, 2) + '\n');
console.table(Object.entries(summary).map(([hypothesis, { conclusion }]) => ({ hypothesis, conclusion })));
