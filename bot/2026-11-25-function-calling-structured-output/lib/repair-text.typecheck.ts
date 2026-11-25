import { generateText, Output, type LanguageModel } from 'ai';
import { ceramicAttr } from '../fixtures/schemas';

// Compiled by tsc. This function is never invoked.
export function checkRepairTextType(model: LanguageModel) {
  return generateText({
    model, prompt: '抽取德化陶瓷商品属性。', output: Output.object({ schema: ceramicAttr }),
    // @ts-expect-error generateText 的 output 路径没有 repairText
    repairText: async () => null,
  });
}
