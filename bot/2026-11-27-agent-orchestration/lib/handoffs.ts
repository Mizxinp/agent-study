import { Runner, handoff, run, tool, user, type AgentInputItem } from '@openai/agents';
import { removeAllTools } from '@openai/agents-core/extensions';
import { assistantMessage, modelResponder } from '@openai/agents-core/testing';
import { z } from 'zod';
import { buildGraph, call, instructions, orderId, question, say, step } from './fixtures';
import { capture, check, observed } from './results';

const toRefund = call('transfer_to_refund_agent');
const toProduct = call('transfer_to_product_agent');
const toOrder = call('transfer_to_order_agent');
const getOrder = call('get_order', { orderId });
const refundText = '请问您要退哪件陶瓷？';
const orderSteps = [step(getOrder), say('订单可以退款')];
const requestInput = (model: ReturnType<typeof buildGraph>['models']['refund']) => model.calls[0].request.input;
const json = (value: unknown) => JSON.stringify(value);
const inputItems = (value: string | AgentInputItem[]) => typeof value === 'string' ? [user(value)] : value;

export async function h1(trace: unknown[] = []) {
  const graph = buildGraph({ triage: [step(toRefund)], refund: [say(refundText)] });
  let events = 0;
  const runner = new Runner();
  runner.on('agent_handoff', () => events++);
  const result = await runner.run(graph.triage, question);
  trace.push(...graph.models.triage.calls, ...graph.models.refund.calls);
  const { request } = graph.models.triage.calls[0];
  const transfer = request.handoffs.find(item => item.toolName === toRefund.name);
  const alsoTool = request.tools?.some(item => item.name === toRefund.name);
  const refundRequest = graph.models.refund.calls[0].request;
  const input = inputItems(refundRequest.input);
  const output = input.find(item => item.type === 'function_call_result');
  const outputText = typeof output?.output === 'object' && 'type' in output.output && output.output.type === 'text' ? output.output.text : undefined;
  const calls = graph.models.triage.calls.length + graph.models.refund.calls.length;
  const collision = buildGraph({ triage: [step(toRefund)], refund: [say(refundText)] });
  let executions = 0;
  let phase = '构造';
  let target: string | undefined;
  const error = await capture(async () => {
    const agent = collision.triage.clone({ tools: [tool({
      name: toRefund.name, description: '同名工具', parameters: z.object({}),
      execute: () => { executions++; return '同名工具'; },
    })] });
    phase = '运行';
    target = (await run(agent, question)).lastAgent?.name;
  });
  return [
    check('H1a', transfer?.strictJsonSchema === true, { strict: transfer?.strictJsonSchema, schema: transfer?.inputJsonSchema, alsoTool }),
    check('H1b', refundRequest.systemInstructions === instructions.refund && json(input).includes(question) &&
      input.some(item => item.type === 'function_call' && item.name === toRefund.name) &&
      outputText === '{"assistant":"Refund agent"}',
    { input, outputText, instructions: refundRequest.systemInstructions }),
    check('H1c', calls === 2 && result.lastAgent?.name === 'Refund agent' && result.activeAgent === result.lastAgent &&
      events === 1 && result.finalOutput === refundText, { calls, events, target: result.lastAgent?.name, finalOutput: result.finalOutput, sameAgent: result.activeAgent === result.lastAgent }),
    observed('H1d', { phase, error, executions, target }),
  ];
}

export async function h2() {
  const graph = buildGraph({
    triage: [step({
      type: 'reasoning', id: 'triage-reasoning',
      content: [{ type: 'input_text', text: '先查订单，再转给退款客服。' }],
    }, getOrder), step(toRefund)],
    refund: [say(refundText)],
  });
  const filtered = graph.triage.clone({ tools: [graph.getOrder], handoffs: [handoff(graph.refund, { toolNameOverride: toRefund.name, inputFilter: removeAllTools })] });
  await run(filtered, question);
  const clean = inputItems(requestInput(graph.models.refund));
  const beforeFilter = inputItems(graph.models.triage.calls[1].request.input);
  const filteredTypes = ['function_call', 'function_call_result', 'reasoning'];
  const beforeFilterTypes = beforeFilter.map(item => item.type);
  const custom = buildGraph({ triage: [step(toRefund)], refund: [say(refundText)] });
  const summary = user('摘要：顾客希望退款。');
  const kept = user(question);
  const replaced = custom.triage.clone({ handoffs: [handoff(custom.refund, {
    toolNameOverride: toRefund.name,
    inputFilter: data => ({
      ...data, inputHistory: [...(typeof data.inputHistory === 'string' ? [user(data.inputHistory)] : data.inputHistory)]
        .filter(item => 'role' in item && item.role === 'user').slice(-1).concat(summary),
      preHandoffItems: [], newItems: [],
    }),
  })] });
  await run(replaced, [user('旧问题'), kept]);
  const actual = requestInput(custom.models.refund);
  const guards = [];
  for (const key of ['previousResponseId', 'conversationId'] as const) {
    const g = buildGraph({ triage: [step(toRefund)], refund: [say(refundText)] });
    const agent = g.triage.clone({ handoffs: [handoff(g.refund, { toolNameOverride: toRefund.name, inputFilter: data => data })] });
    const error = await capture(() => run(agent, question, { [key]: 'offline-id' }));
    guards.push({ key, error, calls: g.models.refund.calls.length });
  }
  return [
    check('H2a', filteredTypes.every(type => beforeFilterTypes.some(item => item === type)) &&
      json(clean).includes(question) && clean.every(item => !filteredTypes.includes(item.type ?? '')),
    { input: clean, items: clean.length, orders: graph.counts.orders, beforeFilterTypes }),
    check('H2b', json(actual) === json([kept, summary]), { input: actual }),
    ...guards.map(({ key, error, calls }) => check('H2c.' + key, error?.errorClass === 'UserError' &&
      error.message.includes('Handoff input filters cannot be used with conversationId or previousResponseId') && calls === 0, { error, calls })),
  ];
}

export async function h3() {
  const g = buildGraph({ triage: [step(toRefund, toProduct)], refund: [say(refundText)] });
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
  try {
    const result = await run(g.triage, question);
    const handoffItems = result.newItems.filter(item => item.type === 'handoff_call_item');
    const secondInHistory = json(result.history).includes(toProduct.callId);
    const productCalls = g.models.product.calls.length;
    return [check('H3', result.lastAgent === g.refund && productCalls === 0 && handoffItems.length === 1 && !secondInHistory,
      { target: result.lastAgent?.name, productCalls, handoffItems: handoffItems.length, secondInHistory, warnings })];
  } finally {
    console.warn = warn;
  }
}

export async function h4() {
  const make = () => buildGraph({ triage: [step(getOrder, toRefund)], refund: [say(refundText)] }, undefined, { orderApproval: true });
  const g = make();
  const paused = await run(g.triage, question);
  const before = { interruptions: paused.interruptions.length, target: paused.lastAgent?.name, refundCalls: g.models.refund.calls.length, orders: g.counts.orders };
  paused.state.approve(paused.interruptions[0]);
  const final = await run(g.triage, paused.state);
  const after = { target: final.lastAgent?.name, refundCalls: g.models.refund.calls.length, triageCalls: g.models.triage.calls.length, orders: g.counts.orders };
  const r = make();
  const rejected = await run(r.triage, question);
  const message = '店长未批准';
  rejected.state.reject(rejected.interruptions[0], { message });
  const rejection = await run(r.triage, rejected.state);
  return [
    check('H4a', before.interruptions === 1 && before.target === 'Triage agent' && before.refundCalls === 0 && before.orders === 0, before),
    check('H4b', after.target === 'Refund agent' && after.orders === 1 && after.refundCalls === 1 && after.triageCalls === 1, after),
    observed('H4c', { target: rejection.lastAgent?.name, orders: r.counts.orders, refundSawMessage: json(requestInput(r.models.refund)).includes(message) }),
  ];
}

export async function h5() {
  const calls = (g: ReturnType<typeof buildGraph>) => Object.values(g.models).reduce((sum, model) => sum + model.calls.length, 0);
  const handoffs = () => buildGraph({ triage: [step(toOrder)], order: orderSteps });
  const asTool = () => buildGraph({ manager: [step(call('order_expert', { input: question })), say('订单可以退款')], order: orderSteps });
  const w = buildGraph({ triage: [say('order')], order: orderSteps });
  const classification = await run(w.triage, question);
  switch (classification.finalOutput) {
    case 'order': await run(w.order, question); break;
    default: throw new Error('未知客服分类');
  }
  const h = handoffs();
  const first = await run(h.triage, question);
  const t = asTool();
  const toolFirst = await run(t.manager, question);
  const follow = [...first.history, user('请再确认')];
  const reset = handoffs();
  await run(reset.triage, follow);
  const continuation = orderSteps.map((response, index) => index ? response : step(call('get_order', { orderId }, 'get_order_again')));
  h.models.order.enqueue(...continuation);
  const before = calls(h);
  await run(first.activeAgent!, follow);
  const t2 = asTool();
  await run(t2.manager, [...toolFirst.history, user('请再确认')]);
  const delay = modelResponder(async () => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return [assistantMessage('专家结果')];
  });
  const p = buildGraph({
    manager: [step(...['order', 'refund', 'product'].map(name => call(name + '_expert', { input: name }))), say('综合答复')],
    order: [delay], refund: [delay], product: [delay],
  });
  const start = Date.now();
  await run(p.manager, question);
  const elapsedMs = Date.now() - start;
  const hp = buildGraph({ triage: [step(toOrder, toRefund, toProduct)], order: [say('只有订单专家答复')] });
  await run(hp.triage, question);
  const history = [user('历史订单一'), assistantMessage('历史回复一'), user('历史订单二'), assistantMessage('历史回复二'), user(question)];
  const hi = handoffs();
  await run(hi.triage, history);
  const ti = asTool();
  await run(ti.manager, history);
  const inherited = json(requestInput(hi.models.order));
  const isolated = json(requestInput(ti.models.order));
  return [
    check('H5a', before === 3 && calls(t) === 4 && calls(w) === 3, { handoff: before, asTool: calls(t), workflow: calls(w) }),
    check('H5b', calls(reset) === 3 && calls(h) - before === 2 && calls(t2) === 4,
      { restart: calls(reset), activeAgent: calls(h) - before, asTool: calls(t2) }),
    check('H5c', calls(p) === 5 && elapsedMs < 250 && calls(hp) === 2,
      { elapsedMs, calls: calls(p), handoffCalls: calls(hp), otherHandoffExperts: hp.models.product.calls.length + hp.models.refund.calls.length }),
    check('H5d', isolated === json([{ type: 'message', role: 'user', content: question }]) && inherited.includes('历史订单一') && inherited.includes('历史回复二'),
      { isolated, isolatedChars: isolated.length, inheritedChars: inherited.length, inherited }),
  ];
}
