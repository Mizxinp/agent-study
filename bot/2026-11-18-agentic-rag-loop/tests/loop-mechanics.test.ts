import type { LanguageModelV4GenerateResult } from '@ai-sdk/provider';
import { generateText, hasToolCall, isStepCount, tool, ToolLoopAgent } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';

const inputSchema = z.object({ sku: z.string() });

function mockResponse(
  content: LanguageModelV4GenerateResult['content'],
  unified: LanguageModelV4GenerateResult['finishReason']['unified'],
): LanguageModelV4GenerateResult {
  return {
    content,
    finishReason: { unified, raw: unified },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 5, text: 5, reasoning: 0 },
    },
    warnings: [],
  };
}

function searchCall(
  toolCallId: string,
  sku = 'GOOD',
  finishReason: 'tool-calls' | 'length' = 'tool-calls',
) {
  return mockResponse(
    [{ type: 'tool-call', toolCallId, toolName: 'search', input: JSON.stringify({ sku }) }],
    finishReason,
  );
}

function textResponse(text: string) {
  return mockResponse([{ type: 'text', text }], 'stop');
}

function searchTool() {
  const execute = vi.fn(({ sku }: z.infer<typeof inputSchema>) => ({ sku }));
  return { execute, tools: { search: tool({ inputSchema, execute }) } };
}

test('H4a generateText 默认执行一次工具并在第一步停止', async () => {
  const model = new MockLanguageModelV4({ doGenerate: searchCall('call-1') });
  const { execute, tools } = searchTool();
  const result = await generateText({ model, tools, prompt: '查询商品' });

  expect(result.steps).toHaveLength(1);
  expect(model.doGenerateCalls).toHaveLength(1);
  expect(execute).toHaveBeenCalledTimes(1);
});

test('H4b ToolLoopAgent 默认在第 20 步停止并发出警告', async () => {
  let callNumber = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => searchCall(`call-${++callNumber}`),
  });
  const { execute, tools } = searchTool();
  const logWarnings = vi.fn();
  vi.stubGlobal('AI_SDK_LOG_WARNINGS', logWarnings);

  try {
    const agent = new ToolLoopAgent({ model, tools });
    const result = await agent.generate({ prompt: '查询商品' });

    expect(result.steps).toHaveLength(20);
    expect(model.doGenerateCalls).toHaveLength(20);
    expect(execute).toHaveBeenCalledTimes(20);
    expect(logWarnings).toHaveBeenCalledWith(expect.objectContaining({
      warnings: expect.arrayContaining([
        expect.objectContaining({ type: 'other', message: expect.stringContaining('isStepCount(20)') }),
      ]),
    }));
  } finally {
    vi.unstubAllGlobals();
  }
});

test('H5 每一步都评估全部停止条件，第三步命中后停止', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: [searchCall('call-1'), searchCall('call-2'), searchCall('call-3')],
  });
  const { tools } = searchTool();
  const condA = vi.fn(hasToolCall('unused-tool'));
  const condB = vi.fn(isStepCount(3));
  const condC = vi.fn(() => false);

  const result = await generateText({
    model,
    tools,
    prompt: '查询商品',
    // 命中的条件放在数组第一位：若短路，condA/condC 在第 3 步就不会被调用。
    stopWhen: [condB, condA, condC],
  });

  expect(result.steps).toHaveLength(3);
  expect(model.doGenerateCalls).toHaveLength(3);
  expect(condA).toHaveBeenCalledTimes(3);
  expect(condB).toHaveBeenCalledTimes(3);
  expect(condC).toHaveBeenCalledTimes(3);
  expect(condA.mock.results.map(({ value }) => value)).toEqual([false, false, false]);
  expect(condB.mock.results.map(({ value }) => value)).toEqual([false, false, true]);
  expect(condC.mock.results.map(({ value }) => value)).toEqual([false, false, false]);
});

test('H6 工具错误作为结果传回模型，后续工具调用成功', async () => {
  const error = new Error('无法查询 SKU BAD');
  const execute = vi.fn(({ sku }: z.infer<typeof inputSchema>) => {
    if (sku === 'BAD') {
      throw error;
    }
    return { sku };
  });
  // 假模型按收到的 prompt 决策：第 2 步只有在 prompt 里看到工具错误时才改参重试。
  const model = new MockLanguageModelV4({
    doGenerate: async options => {
      const n = model.doGenerateCalls.length;
      if (n === 1) return searchCall('call-bad', 'BAD');
      if (n === 2) {
        const sawError = JSON.stringify(options.prompt).includes('无法查询 SKU BAD');
        return sawError ? searchCall('call-good', 'GOOD') : textResponse('未收到错误');
      }
      return textResponse('查询成功');
    },
  });

  const result = await generateText({
    model,
    tools: { search: tool({ inputSchema, execute }) },
    prompt: '查询商品',
    stopWhen: isStepCount(5),
  });

  expect(result.steps).toHaveLength(3);
  expect(result.steps[0].content).toContainEqual(expect.objectContaining({
    type: 'tool-error', toolCallId: 'call-bad', error,
  }));
  expect(model.doGenerateCalls[1].prompt).toContainEqual({
    role: 'tool',
    content: [{
      type: 'tool-result',
      toolCallId: 'call-bad',
      toolName: 'search',
      // 错误以 error-text 回流给模型，内容为 Error#toString()（带 "Error: " 前缀）。
      output: { type: 'error-text', value: error.toString() },
    }],
  });
  expect(result.steps[1].content).toContainEqual(expect.objectContaining({
    type: 'tool-result', toolCallId: 'call-good', output: { sku: 'GOOD' },
  }));
  expect(execute).toHaveBeenCalledTimes(2);
  expect(result.text).toBe('查询成功');
});

test('H7 长度截断时跳过工具执行并在第一步停止', async () => {
  const model = new MockLanguageModelV4({ doGenerate: searchCall('call-1', 'GOOD', 'length') });
  const { execute, tools } = searchTool();
  const result = await generateText({
    model,
    tools,
    prompt: '查询商品',
    stopWhen: isStepCount(5),
  });

  expect(execute).not.toHaveBeenCalled();
  expect(result.steps).toHaveLength(1);
  expect(model.doGenerateCalls).toHaveLength(1);
  expect(result.finishReason).toBe('length');
});

test('H8 prepareStep 替换的消息成为后续步骤的历史基线', async () => {
  const originalPrompt = 'ORIGINAL-USER-PROMPT';
  const baseline = 'BASELINE-FROM-PREPARESTEP';
  const model = new MockLanguageModelV4({
    doGenerate: [searchCall('call-1'), searchCall('call-2'), textResponse('查询完成')],
  });
  const { tools } = searchTool();
  const result = await generateText({
    model,
    tools,
    prompt: originalPrompt,
    stopWhen: isStepCount(5),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 1) {
        return { messages: [{ role: 'user', content: baseline }] };
      }
    },
  });

  expect(result.steps).toHaveLength(3);
  const baselineMessage = { role: 'user', content: [{ type: 'text', text: baseline }] };
  expect(model.doGenerateCalls[1].prompt).toEqual([baselineMessage]);
  const thirdPrompt = model.doGenerateCalls[2].prompt;
  expect(JSON.stringify(thirdPrompt)).not.toContain(originalPrompt);
  expect(thirdPrompt).toEqual([
    baselineMessage,
    {
      role: 'assistant',
      content: [{ type: 'tool-call', toolCallId: 'call-2', toolName: 'search', input: { sku: 'GOOD' } }],
    },
    {
      role: 'tool',
      content: [{
        type: 'tool-result',
        toolCallId: 'call-2',
        toolName: 'search',
        output: { type: 'json', value: { sku: 'GOOD' } },
      }],
    },
  ]);
});

test('agentic 配置：prepareStep 只在第 1 步强制 toolChoice=search，之后恢复 auto', async () => {
  const model = new MockLanguageModelV4({
    doGenerate: [searchCall('call-1'), textResponse('查询完成')],
  });
  const { tools } = searchTool();
  const result = await generateText({
    model,
    tools,
    prompt: '查询商品',
    stopWhen: isStepCount(5),
    prepareStep: ({ stepNumber }) => {
      if (stepNumber === 0) {
        return { toolChoice: { type: 'tool', toolName: 'search' } };
      }
    },
  });

  expect(result.steps).toHaveLength(2);
  expect(model.doGenerateCalls[0].toolChoice).toEqual({ type: 'tool', toolName: 'search' });
  expect(model.doGenerateCalls[1].toolChoice).toEqual({ type: 'auto' });
});
