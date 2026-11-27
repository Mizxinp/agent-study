import { generateText, isStepCount, ToolLoopAgent, tool, type ModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';
import { ledger, orderId, refundArgs } from './fixtures';
import { withData } from './resume';
import { capture, check, observed } from './results';

type MockResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;
const usage = { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined } };
const text = (text: string): MockResult => ({
  content: [{ type: 'text', text }], usage, warnings: [],
  finishReason: { unified: 'stop', raw: 'stop' },
});
const toolCall = (toolName: string, input: object = {}, toolCallId = toolName): MockResult => ({
  content: [{ type: 'tool-call', toolName, toolCallId, input: JSON.stringify(input) }],
  usage, warnings: [], finishReason: { unified: 'tool-calls', raw: 'tool-calls' },
});
const refundCall = toolCall('issue_refund', { orderId, amount: 100 });
const approval = { issue_refund: 'user-approval' } as const;
const prompt = '请为 ORD-1001 退款 100 元';
const mock = (...responses: MockResult[]) => new MockLanguageModelV4({ doGenerate: responses });

function approvedHistory(history: ModelMessage[], tamper = false): ModelMessage[] {
  const copy = structuredClone(history);
  for (const message of copy) {
    if (message.role !== 'assistant' || typeof message.content === 'string') continue;
    const request = message.content.find(part => part.type === 'tool-approval-request');
    if (!request) continue;
    if (tamper) {
      const call = message.content.find(part => part.type === 'tool-call' && part.toolCallId === request.toolCallId);
      if (call?.type !== 'tool-call') throw new Error('审批请求缺少工具调用');
      call.input = { orderId, amount: 9999 };
    }
    return [...copy, { role: 'tool', content: [{ type: 'tool-approval-response', approvalId: request.approvalId, approved: true }] }];
  }
  throw new Error('缺少审批请求');
}

export async function h8() {
  return withData(async dir => {
    const make = (subdir: string, signing = false) => {
      const book = ledger(dir + '/' + subdir);
      const tools = { issue_refund: tool({ inputSchema: refundArgs, execute: book.append }) };
      // Public test fixture value, generated locally for this demonstration only.
      const options = { tools, toolApproval: approval,
        experimental_toolApprovalSecret: signing ? 'offline-demo-fixture' : undefined };
      return {
        book,
        pause: () => generateText({ ...options, model: mock(refundCall), prompt }),
        resume: (messages: ModelMessage[]) => generateText({ ...options, model: mock(text('退款流程结束')), messages }),
      };
    };
    const plain = make('plain');
    const paused = await plain.pause();
    const before = (await plain.book.rows()).length;
    const history: ModelMessage[] = [{ role: 'user', content: prompt }, ...paused.responseMessages];
    const approved = approvedHistory(history);
    const requests = paused.responseMessages.flatMap(message =>
      message.role === 'assistant' && Array.isArray(message.content) ?
        message.content.filter(part => part.type === 'tool-approval-request') : []);
    await plain.resume(approved);
    const after = (await plain.book.rows()).length;
    await plain.resume(approved);
    const replay = (await plain.book.rows()).length;
    const unsigned = make('unsigned');
    const unsignedError = await capture(() => unsigned.resume(approvedHistory(history, true)));
    const signed = make('signed', true);
    const signedPause = await signed.pause();
    const signedHistory: ModelMessage[] = [{ role: 'user', content: prompt }, ...signedPause.responseMessages];
    const signedError = await capture(() => signed.resume(approvedHistory(signedHistory, true)));
    return [
      check('H8a', requests.length === 1 && paused.stoppedBy === 'approval' && before === 0,
        { requests: requests.length, stoppedBy: paused.stoppedBy, ledgerRows: before }),
      check('H8b', after === 1, { ledgerRows: after,
        historyShape: approved.slice(1).map(message => ({ role: message.role,
          types: Array.isArray(message.content) ? message.content.map(part => part.type) : ['text'] })) }),
      observed('H8c.unsigned', { error: unsignedError, amounts: (await unsigned.book.rows()).map(row => row.amount) }),
      check('H8c.signed', signedError?.errorClass === 'InvalidToolApprovalSignatureError' && (await signed.book.rows()).length === 0,
        { error: signedError, ledgerRows: (await signed.book.rows()).length }),
      check('H8d', replay === 2, { ledgerRows: replay }),
    ];
  });
}

const details = '白瓷茶杯的内部查询记录'.repeat(20);
const summary = '白瓷茶杯有货';
const lookup = tool({ inputSchema: z.object({}), execute: () => details });

export async function h9a() {
  async function research(extract: boolean) {
    const childModel = mock(toolCall('lookup', {}, 'lookup-1'), toolCall('lookup', {}, 'lookup-2'), text(summary));
    const child = new ToolLoopAgent({ model: childModel, tools: { lookup } });
    const parentModel = mock(toolCall('research'), text('已查库存'));
    const parent = new ToolLoopAgent({ model: parentModel, tools: { research: tool({
      inputSchema: z.object({}),
      execute: async () => {
        const result = await child.generate({ prompt: '查白瓷茶杯库存' });
        return { text: result.text, steps: result.steps.map(step => step.content) };
      },
      ...(extract ? { toModelOutput: ({ output }: { output: { text: string } }) => ({ type: 'text' as const, value: output.text }) } : {}),
    }) } });
    const result = await parent.generate({ prompt: '白瓷茶杯有货吗？' });
    return { childSteps: childModel.doGenerateCalls.length, parentSteps: result.steps.length,
      totalCalls: childModel.doGenerateCalls.length + parentModel.doGenerateCalls.length,
      input: JSON.stringify(parentModel.doGenerateCalls[1].prompt) };
  }
  const a = await research(true);
  const b = await research(false);
  const { input, ...counts } = a;
  return [check('H9a', a.childSteps === 3 && a.parentSteps === 2 && a.totalCalls === 5 &&
    input.includes(summary) && !input.includes(details) && b.input.includes(details) && input.length < b.input.length,
  { ...counts, withSummaryChars: input.length, withoutExtractorChars: b.input.length,
    summaryVisible: input.includes(summary), detailsVisible: input.includes(details), controlDetailsVisible: b.input.includes(details) })];
}

export async function h9b() {
  const loop = new MockLanguageModelV4({ doGenerate: async () => toolCall('lookup') });
  const warnings: string[] = [];
  const warn = console.warn;
  const processWarning = (warning: Error) => warnings.push(warning.message);
  process.on('warning', processWarning);
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
  let defaultResult;
  try {
    defaultResult = await new ToolLoopAgent({ model: loop, tools: { lookup } }).generate({ prompt });
    await new Promise<void>(resolve => setImmediate(resolve));
  } finally {
    console.warn = warn;
    process.off('warning', processWarning);
  }
  const bounded = await new ToolLoopAgent({ model: loop, tools: { lookup }, stopWhen: isStepCount(3) }).generate({ prompt });
  const natural = await new ToolLoopAgent({ model: mock(text('完成')) }).generate({ prompt });
  const paused = await new ToolLoopAgent({ model: mock(toolCall('lookup')), tools: { lookup },
    toolApproval: { lookup: 'user-approval' } }).generate({ prompt });
  const external = await new ToolLoopAgent({ model: mock(toolCall('lookup')),
    tools: { lookup: tool({ inputSchema: z.object({}) }) } }).generate({ prompt });
  const cases = [
    { key: 'default', run: defaultResult, expected: 'stop-condition', steps: 20 },
    { key: 'bounded', run: bounded, expected: 'stop-condition', steps: 3 },
    { key: 'natural', run: natural, expected: 'model', steps: 1 },
    { key: 'approval', run: paused, expected: 'approval', steps: 1 },
    { key: 'external', run: external, expected: 'tool-without-execute', steps: 1 },
  ];
  return cases.map(({ key, run, expected, steps }) => check('H9b.' + key, run.steps.length === steps && run.stoppedBy === expected &&
    run.finishReason === (key === 'natural' ? 'stop' : 'tool-calls'),
  { steps: run.steps.length, stoppedBy: run.stoppedBy, finishReason: run.finishReason, ...(key === 'default' ? { warnings } : {}) }));
}

export async function h9c() {
  let childStoppedBy: string | undefined;
  let childApprovalRequests: number | undefined;
  const child = new ToolLoopAgent({ model: mock(toolCall('lookup')), tools: { lookup }, toolApproval: { lookup: 'user-approval' } });
  const parentModel = mock(toolCall('research'), text('结束'));
  const parent = new ToolLoopAgent({ model: parentModel, tools: { research: tool({
    inputSchema: z.object({}),
    execute: async () => {
      const result = await child.generate({ prompt });
      childStoppedBy = result.stoppedBy;
      childApprovalRequests = result.content.filter(part => part.type === 'tool-approval-request').length;
      return result.text;
    },
  }) } });
  let content;
  const error = await capture(async () => { content = (await parent.generate({ prompt })).steps.map(step => step.content); });
  return [observed('H9c', { childStoppedBy, childApprovalRequests, error, parentCalls: parentModel.doGenerateCalls.length, content })];
}

export async function h9d() {
  async function scenario(forward: boolean) {
    const controller = new AbortController();
    let completedSteps = 0;
    let childError;
    const model = new MockLanguageModelV4({ doGenerate: async ({ abortSignal }) => {
      controller.abort();
      abortSignal?.throwIfAborted();
      return completedSteps < 2 ? toolCall('lookup', {}, 'lookup-' + completedSteps) : text(summary);
    } });
    const child = new ToolLoopAgent({ model, tools: { lookup }, onStepFinish: () => { completedSteps++; } });
    const parent = new ToolLoopAgent({ model: mock(toolCall('research')), tools: { research: tool({
      inputSchema: z.object({}),
      execute: async (_, { abortSignal }) => {
        childError = await capture(() => child.generate({ prompt, abortSignal: forward ? abortSignal : undefined }));
        return '结束';
      },
    }) } });
    const parentError = await capture(() => parent.generate({ prompt, abortSignal: controller.signal }));
    return { childCalls: model.doGenerateCalls.length, completedSteps, childError, parentError };
  }
  const forwarded = await scenario(true);
  const omitted = await scenario(false);
  return [check('H9d', forwarded.completedSteps < 3 && omitted.completedSteps === 3, { forwarded, omitted })];
}

export async function h9() {
  return [...await h9a(), ...await h9b(), ...await h9c(), ...await h9d()];
}
