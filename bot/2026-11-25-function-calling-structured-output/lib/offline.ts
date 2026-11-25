import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogle } from '@ai-sdk/google';

export const models = {
  openai: 'gpt-4.1-mini',
  anthropic: 'claude-sonnet-4-6',
  anthropicForcedChoiceRejected: 'claude-opus-5-5',
  google: 'gemini-2.5-flash',
};

export type Captured = { url: string; body: unknown };
const tokens = { input_tokens: 1, output_tokens: 1 };
export const callInput = { capacityMl: 120 };
export const sseDeltas = ['{"capacityMl":', '80', '}'];

export function responsesText(text: string) {
  return {
    status: 'completed', usage: tokens,
    output: [{
      type: 'message', role: 'assistant', id: 'msg_mock',
      content: [{ type: 'output_text', text, annotations: [] }],
    }],
  };
}

export function chatText() {
  return { choices: [{ index: 0, finish_reason: 'stop', message: { content: '完成' } }] };
}

export function anthropicTool(name: string, input: object) {
  return { type: 'tool_use', id: 'toolu_mock', name, input };
}

export function anthropicMessage(content: object[], stopReason = 'end_turn') {
  return { type: 'message', content, stop_reason: stopReason, usage: tokens };
}

export function geminiMessage(part: object) {
  return {
    candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1, totalTokenCount: 2 },
  };
}

export function responsesSse() {
  const item = { type: 'function_call', id: 'fc_mock', call_id: 'call_mock', name: 'inspect' };
  const doneArguments = JSON.stringify(callInput);
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { ...item, arguments: '' } },
    ...sseDeltas.map(delta => ({
      type: 'response.function_call_arguments.delta', output_index: 0, item_id: item.id, delta,
    })),
    {
      type: 'response.output_item.done', output_index: 0,
      item: { ...item, status: 'completed', arguments: doneArguments },
    },
    { type: 'response.completed', response: { usage: tokens } },
  ];
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), {
    headers: { 'content-type': 'text/event-stream' },
  });
}

export function offline(requests: Captured[], reply: object) {
  const fetch: typeof globalThis.fetch = async (url, init) => {
    if (typeof init?.body !== 'string') throw new Error('预期 JSON 字符串请求体');
    requests.push({ url: String(url), body: JSON.parse(init.body) });
    return reply instanceof Response ? reply.clone() : Response.json(reply);
  };
  const settings = { apiKey: 'test', fetch };
  return {
    openai: createOpenAI(settings),
    anthropic: createAnthropic(settings),
    google: createGoogle(settings),
  };
}
