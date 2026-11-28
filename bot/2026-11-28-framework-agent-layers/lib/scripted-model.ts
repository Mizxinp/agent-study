import { simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { z } from 'zod';

const fixtureTool = tool({
  description: 'Return a deterministic local fixture.',
  inputSchema: z.object({}),
  execute: async () => 'ok',
});

export const tools = { alpha: fixtureTool, beta: fixtureTool };
export const prompt = 'Run the offline tool loop.';

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

type GenerateResult = Awaited<ReturnType<MockLanguageModelV4['doGenerate']>>;
type Stream = Awaited<ReturnType<MockLanguageModelV4['doStream']>>['stream'];
type StreamPart = Stream extends ReadableStream<infer Part> ? Part : never;
type CallOptions = Parameters<MockLanguageModelV4['doGenerate']>[0];

export function scriptedModel(naturalEndAt = Infinity) {
  const calls: { step: number; userAgent: string | null; toolOrder: string[]; finishReason: string }[] = [];

  function reply(options: CallOptions): GenerateResult & {
    content: Extract<GenerateResult['content'][number], { type: 'text' | 'tool-call' }>[];
  } {
    const step = calls.length + 1;
    const finishReason = step >= naturalEndAt ? 'stop' : 'tool-calls';
    calls.push({
      step,
      userAgent: options.headers?.['user-agent'] ?? null,
      toolOrder: options.tools?.map(tool => tool.name) ?? [],
      finishReason,
    });
    return {
      content: finishReason === 'stop'
        ? [{ type: 'text', text: 'done' }]
        : [{ type: 'tool-call', toolCallId: `call-${step}`, toolName: 'alpha', input: '{}' }],
      usage,
      warnings: [],
      finishReason: { unified: finishReason, raw: finishReason },
    };
  }

  const model = new MockLanguageModelV4({
    provider: 'fixture',
    modelId: 'offline-loop',
    doGenerate: async options => reply(options),
    doStream: async options => {
      const result = reply(options);
      const part = result.content[0];
      return {
        stream: simulateReadableStream<StreamPart>({
          initialDelayInMs: null,
          chunkDelayInMs: null,
          chunks: [
            { type: 'stream-start', warnings: [] },
            ...(part.type === 'text'
              ? [
                  { type: 'text-start' as const, id: 'text' },
                  { type: 'text-delta' as const, id: 'text', delta: part.text },
                  { type: 'text-end' as const, id: 'text' },
                ]
              : [part]),
            { type: 'finish', finishReason: result.finishReason, usage },
          ],
        }),
      };
    },
  });
  return { model, calls };
}
