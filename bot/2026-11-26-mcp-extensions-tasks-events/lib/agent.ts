import { createMCPClient } from '@ai-sdk/mcp';
import { generateText, isStepCount } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';

export async function runAgent(port: string, toolName: string, input: object) {
  const client = await createMCPClient({ transport: { type: 'http', url: 'http://127.0.0.1:' + port + '/api/mcp' } });
  try {
    const usage = {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    };
    const model = new MockLanguageModelV4({ doGenerate: [
      { content: [{ type: 'tool-call', toolCallId: 'fixture-call', toolName, input: JSON.stringify(input) }],
        finishReason: { unified: 'tool-calls', raw: undefined }, usage, warnings: [] },
      { content: [{ type: 'text', text: '处理完成' }], finishReason: { unified: 'stop', raw: undefined }, usage, warnings: [] },
    ] });
    const result = await generateText({
      model, tools: await client.tools(), prompt: JSON.stringify(input), stopWhen: isStepCount(2),
    });
    return { steps: result.steps.length, text: result.text, toolResults: result.steps.flatMap(step => step.toolResults) };
  } finally {
    await client.close();
  }
}
