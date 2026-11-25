import { isDeepStrictEqual } from 'node:util';
import {
  generateText, streamText, Output, tool, jsonSchema, asSchema,
  NoObjectGeneratedError, ToolChoiceViolationError, UnsupportedFunctionalityError,
} from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';
import { fixtures, ceramicSample, strictSample } from '../fixtures/schemas';
import {
  offline, models, responsesText, chatText, anthropicMessage, anthropicTool,
  geminiMessage, responsesSse, callInput, sseDeltas, type Captured,
} from './offline';

const prompt = '抽取德化陶瓷商品属性。';
const inputSchema = z.object({ capacityMl: z.number().int() });
const tools = { inspect: tool({ inputSchema }) };
const strictTools = { inspect: tool({ inputSchema, strict: true }) };
const named = { type: 'tool', toolName: 'inspect' } as const;

function field(value: unknown, ...keys: (string | number)[]): unknown {
  for (const key of keys) {
    if (value == null || typeof value !== 'object') return undefined;
    value = (value as Record<string | number, unknown>)[key];
  }
  return value;
}

async function collect<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const parts: T[] = [];
  for await (const part of stream) parts.push(part);
  return parts;
}

function errorOf(run: () => PromiseLike<unknown>) {
  return Promise.resolve().then(run).then(() => undefined, (error: unknown) => error);
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
};
const stop = { unified: 'stop', raw: 'stop' } as const;
function mockText(text: string) {
  return new MockLanguageModelV4({
    doGenerate: { content: [{ type: 'text', text }], finishReason: stop, usage, warnings: [] },
    doStream: () => Promise.resolve({
      stream: simulateReadableStream({
        chunks: [
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'text' },
          { type: 'text-delta', id: 'text', delta: text },
          { type: 'text-end', id: 'text' },
          { type: 'finish', finishReason: stop, usage },
        ],
      }),
    }),
  });
}
function mockBadTool() {
  return new MockLanguageModelV4({
    doGenerate: {
      content: [{ type: 'tool-call', toolCallId: 'call_mock', toolName: 'inspect', input: '{' }],
      finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage, warnings: [],
    },
  });
}

type Check = (label: string, actual: unknown, expected: unknown) => void;
type Experiment = (requests: Captured[], check: Check) => Promise<void>;

export const experiments = {
  async H1(requests, check) {
    const { openai } = offline(requests, responsesText('完成'));
    await generateText({ model: openai(models.openai), tools, prompt });
    await generateText({ model: openai(models.openai), tools: strictTools, prompt });
    await generateText({ model: offline(requests, chatText()).openai.chat(models.openai), tools, prompt });
    check('默认 URL 以 /responses 结尾', requests[0].url.endsWith('/responses'), true);
    check('Responses 默认工具 strict', field(requests[0].body, 'tools', 0, 'strict'), false);
    check('Responses 显式工具 strict', field(requests[1].body, 'tools', 0, 'strict'), true);
    const chatFunction = field(requests[2].body, 'tools', 0, 'function');
    check('Chat function 存在且省略 strict', !!chatFunction && !Object.hasOwn(chatFunction, 'strict'), true);
  },
  async H2(requests, check) {
    const { openai } = offline(requests, responsesText(JSON.stringify(ceramicSample)));
    const params = { model: openai(models.openai), tools, prompt,
      output: Output.object({ schema: fixtures.ceramicAttr }) };
    const result = await generateText(params);
    await generateText({ ...params, providerOptions: { openai: { strictJsonSchema: false } } });
    const format = field(requests[0].body, 'text', 'format');
    check('输出类型', field(format, 'type'), 'json_schema');
    check('默认输出 strict', field(format, 'strict'), true);
    check('默认输出名称', field(format, 'name'), 'response');
    check('同一请求的工具 strict', field(requests[0].body, 'tools', 0, 'strict'), false);
    check('关闭输出 strict', field(requests[1].body, 'text', 'format', 'strict'), false);
    check('required', field(format, 'schema', 'required'), ['form', 'glaze', 'capacityMl', 'uses', 'dimensions']);
    check('additionalProperties', field(format, 'schema', 'additionalProperties'), false);
    check('整数 maximum', field(format, 'schema', 'properties', 'quantity', 'maximum'), Number.MAX_SAFE_INTEGER);
    check('本地默认数量', result.output.quantity, 1);

    const tooSmall = { ...strictSample, capacityMl: 20 };
    const localRange = offline(requests, responsesText(JSON.stringify(tooSmall)));
    const error = await errorOf(async () => (await generateText({
      model: localRange.openai(models.openai), prompt,
      output: Output.object({ schema: fixtures.ceramicAttrLocalRange }),
    })).output);
    const sent = field(requests[2].body, 'text', 'format', 'schema', 'properties', 'capacityMl');
    check('本地范围变体发出的容量 schema', sent, { type: 'integer', description: '容量（毫升）' });
    check('本地范围变体发出的数量 schema', field(requests[2].body, 'text', 'format', 'schema', 'properties', 'quantity'), { anyOf: [{ type: 'integer' }, { type: 'null' }] });
    check('本地范围变体拒绝 20', NoObjectGeneratedError.isInstance(error) && error.message.includes('did not match schema'), true);
  },
  async H3(requests, check) {
    const { openai } = offline(requests, responsesText('完成'));
    const model = openai(models.openai);
    const compatible = (type: 'string' | 'number') => ({
      inspect: tool({ inputSchema: jsonSchema({
        type: 'object', properties: { tag: { type: 'string', pattern: '^(?!test).*' } },
        propertyNames: { type },
      }) }),
    });
    const result = await generateText({ model, prompt, tools: compatible('string') });
    const schema = field(requests[0].body, 'tools', 0, 'parameters');
    check('lookaround 删除', field(schema, 'properties', 'tag'), { type: 'string' });
    check('propertyNames 删除', field(schema, 'propertyNames'), undefined);
    check('警告类型', result.warnings?.map(warning => warning.type), ['compatibility', 'compatibility']);
    const error = await errorOf(() => generateText({ model, prompt, tools: compatible('number') }));
    check('非字符串 propertyNames 抛 UnsupportedFunctionalityError', UnsupportedFunctionalityError.isInstance(error), true);
    check('截获请求数', requests.length, 1);
  },
  async H4(requests, check) {
    const response = anthropicMessage([anthropicTool('inspect', strictSample)], 'tool_use');
    const { anthropic } = offline(requests, response);
    const model = anthropic(models.anthropic);
    const ceramicTools = { inspect: tool({ inputSchema: fixtures.ceramicAttrStrictSafe, strict: true }) };
    await generateText({ model, prompt, tools: ceramicTools, toolChoice: 'required' });
    await generateText({ model, prompt, tools: ceramicTools, toolChoice: named });
    const toolBody = field(requests[0].body, 'tools', 0);
    check('工具 strict', field(toolBody, 'strict'), true);
    check('工具 minimum', field(toolBody, 'input_schema', 'properties', 'capacityMl', 'minimum'), 50);
    check('工具 maximum', field(toolBody, 'input_schema', 'properties', 'capacityMl', 'maximum'), 5000);
    check('required 映射', field(requests[0].body, 'tool_choice', 'type'), 'any');
    check('指定工具映射', field(requests[1].body, 'tool_choice'), { type: 'tool', name: 'inspect' });

    const native = offline(requests, anthropicMessage([{ type: 'text', text: JSON.stringify(strictSample) }]));
    const result = await generateText({
      model: native.anthropic(models.anthropic), prompt,
      output: Output.object({ schema: fixtures.ceramicAttrStrictSafe }),
    });
    const format = field(requests[2].body, 'output_config', 'format');
    const capacity = field(format, 'schema', 'properties', 'capacityMl');
    check('原生输出类型', field(format, 'type'), 'json_schema');
    check('原生输出无 minimum', field(capacity, 'minimum'), undefined);
    check('原生输出无 maximum', field(capacity, 'maximum'), undefined);
    const description = String(field(capacity, 'description'));
    check('描述包含两个边界', description.includes('50') && description.includes('5000'), true);
    check('根对象关闭额外属性', field(format, 'schema', 'additionalProperties'), false);
    check('嵌套对象关闭额外属性', field(format, 'schema', 'properties', 'dimensions', 'additionalProperties'), false);
    check('原生输出解析', result.output, strictSample);

    const downgraded = await generateText({
      model: anthropic(models.anthropicForcedChoiceRejected), prompt, tools, toolChoice: 'required',
    });
    check('拒绝强制时降级', field(requests[3].body, 'tool_choice', 'type'), 'auto');
    check('toolChoice 警告数', downgraded.warnings?.filter(
      warning => warning.type === 'unsupported' && warning.feature === 'toolChoice',
    ).length, 1);
  },
  async H5(requests, check) {
    const sample = { attribute1: '盖碗' };
    const native = offline(requests, anthropicMessage([{ type: 'text', text: JSON.stringify(sample) }]));
    const fallback = offline(requests, anthropicMessage([anthropicTool('json', sample)], 'tool_use'));
    const ten = await generateText({
      model: native.anthropic(models.anthropic), prompt, output: Output.object({ schema: fixtures.optional10 }),
    });
    const eleven = await generateText({
      model: fallback.anthropic(models.anthropic), prompt, output: Output.object({ schema: fixtures.optional11 }),
    });
    check('10 项走原生', field(requests[0].body, 'output_config', 'format', 'type'), 'json_schema');
    check('10 项无 json 工具', (field(requests[0].body, 'tools') as object[] | undefined)
      ?.some(entry => field(entry, 'name') === 'json') ?? false, false);
    check('10 项输出', ten.output, sample);
    check('11 项无原生 format', field(requests[1].body, 'output_config', 'format'), undefined);
    check('11 项 json 工具', field(requests[1].body, 'tools', 0, 'name'), 'json');
    check('11 项强制调用', field(requests[1].body, 'tool_choice', 'type'), 'any');
    check('11 项关闭并行', field(requests[1].body, 'tool_choice', 'disable_parallel_tool_use'), true);
    check('11 项工具响应解析', eleven.output, sample);
  },
  async H6(requests, check) {
    const choices = [
      { choice: 'auto', tools: { ...tools, strictInspect: strictTools.inspect }, expected: { mode: 'VALIDATED' } },
      { choice: 'auto', tools, expected: { mode: 'AUTO' } },
      { choice: 'required', tools, expected: { mode: 'ANY' } },
      { choice: named, tools, expected: { mode: 'ANY', allowedFunctionNames: ['inspect'] } },
      { choice: 'none', tools, expected: { mode: 'NONE' } },
    ] as const;
    for (const [index, item] of choices.entries()) {
      const forced = item.choice === 'required' || typeof item.choice === 'object';
      const { google } = offline(requests, geminiMessage(forced
        ? { functionCall: { name: 'inspect', args: callInput } }
        : { text: '完成' }));
      await generateText({ model: google(models.google), prompt, tools: item.tools, toolChoice: item.choice });
      check(`工具选择 ${index + 1}`, field(requests[index].body, 'toolConfig', 'functionCallingConfig'), item.expected);
    }
    const sample = { kind: '釉色' };
    const schema = z.object({ kind: z.literal('釉色') });
    const original = await asSchema(schema).jsonSchema;
    const { google } = offline(requests, geminiMessage({ text: JSON.stringify(sample) }));
    const result = await generateText({ model: google(models.google), prompt, output: Output.object({ schema }) });
    const config = field(requests[5].body, 'generationConfig');
    const kind = field(config, 'responseJsonSchema', 'properties', 'kind');
    check('原始 const', field(original, 'properties', 'kind', 'const'), '釉色');
    check('输出 MIME', field(config, 'responseMimeType'), 'application/json');
    check('发送的 const', field(kind, 'const'), undefined);
    check('发送的单值 enum', field(kind, 'enum'), ['釉色']);
    check('Google 结构化输出解析', result.output, sample);
  },
  async H7(_requests, check) {
    const model = mockText('普通文本');
    const params = { model, prompt, tools, toolChoice: 'required' as const };
    check('generateText 工具选择错误', ToolChoiceViolationError.isInstance(
      await errorOf(() => generateText(params)),
    ), true);
    const stream = streamText({ ...params, onError: () => {} });
    const parts = await collect(stream.fullStream);
    const step = parts.find(part => part.type === 'finish-step');
    check('流式步骤 finishReason', step?.finishReason, 'error');
    check('流式工具选择错误 part', parts.filter(part =>
      part.type === 'error' && ToolChoiceViolationError.isInstance(part.error)).length, 1);

    for (const [label, text, message] of [
      ['非 JSON', '普通文本', 'could not parse'],
      ['容量越界', JSON.stringify({ ...ceramicSample, capacityMl: 20 }), 'did not match schema'],
    ]) {
      const error = await errorOf(async () => (await generateText({
        model: mockText(text), prompt, output: Output.object({ schema: fixtures.ceramicAttr }),
      })).output);
      check(`${label} 错误类型`, NoObjectGeneratedError.isInstance(error), true);
      check(`${label} 错误消息`, NoObjectGeneratedError.isInstance(error) && error.message.includes(message), true);
      check(`${label} 原文本`, NoObjectGeneratedError.isInstance(error) && error.text, text);
    }
    const executed: unknown[] = [];
    const executable = { inspect: tool({
      inputSchema, execute: async input => { executed.push(input); return '完成'; },
    }) };
    const invalid = await generateText({ model: mockBadTool(), prompt, tools: executable });
    check('无修复 invalid 工具调用', invalid.toolCalls[0]?.invalid, true);
    check('无修复 tool-error', invalid.content.filter(part => part.type === 'tool-error').length, 1);
    check('无修复执行次数', executed.length, 0);
    let repairs = 0;
    const repaired = await generateText({
      model: mockBadTool(), prompt, tools: executable,
      repairToolCall: async ({ toolCall }) => {
        repairs++;
        return { ...toolCall, input: JSON.stringify(callInput) };
      },
    });
    check('修复调用次数', repairs, 1);
    check('修复后工具结果数', repaired.toolResults.length, 1);
    check('修复后执行参数及次数', executed, [callInput]);
  },
  async H8(requests, check) {
    const { openai } = offline(requests, responsesSse());
    const executed: unknown[] = [];
    const stream = streamText({
      model: openai(models.openai), prompt, onError: () => {},
      tools: { inspect: tool({ inputSchema, execute: async input => { executed.push(input); return '完成'; } }) },
    });
    const parts = await collect(stream.fullStream);
    const deltas = parts.filter(part => part.type === 'tool-input-delta');
    const call = parts.find(part => part.type === 'tool-call');
    check('请求 stream 标志', field(requests[0].body, 'stream'), true);
    check('错误 part 数', parts.filter(part => part.type === 'error').length, 0);
    check('增量数', deltas.length, 3);
    check('增量值', deltas.map(part => part.delta), sseDeltas);
    check('最终工具输入', call?.input, callInput);
    check('最终输入与拼接增量有差异', JSON.stringify(call?.input) !== deltas.map(part => part.delta).join(''), true);
    check('工具执行参数及次数', executed, [callInput]);
  },
} satisfies Record<string, Experiment>;

export type Hypothesis = keyof typeof experiments;

export async function runExperiment(id: Hypothesis) {
  const requests: Captured[] = [];
  const checks: { label: string; actual: unknown; expected: unknown; pass: boolean }[] = [];
  let error: string | undefined;
  try {
    await experiments[id](requests, (label, actual, expected) => {
      checks.push({ label, actual: actual ?? (actual === null ? null : '（缺省）'),
        expected: expected ?? (expected === null ? null : '（缺省）'), pass: isDeepStrictEqual(actual, expected) });
    });
  } catch (cause) {
    error = cause instanceof Error ? cause.message : String(cause);
  }
  return {
    id, verdict: error ? '不确定' : checks.every(check => check.pass) ? '支持' : '不支持',
    requestCount: requests.length, assertions: checks.length,
    passed: checks.filter(check => check.pass).length, checks, requests, error,
  };
}
