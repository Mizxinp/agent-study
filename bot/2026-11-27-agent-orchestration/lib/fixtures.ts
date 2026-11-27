import { Agent, handoff, setTracingDisabled, tool, type AgentInputItem } from '@openai/agents';
import { functionCall, assistantMessage, modelResponse, ScriptedModel, type ScriptedModelInput } from '@openai/agents-core/testing';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

process.env.OPENAI_AGENTS_DISABLE_TRACING = '1';
setTracingDisabled(true);

export const orderId = 'ORD-1001';
export const question = '查订单 ORD-1001 并告知可否退款';
export const orderArgs = z.object({ orderId: z.string() });
export const refundArgs = orderArgs.extend({ amount: z.number() });
export const instructions = {
  triage: '你是德化陶瓷店的分流客服。',
  order: '你负责查询德化陶瓷店订单。',
  refund: '你负责处理德化陶瓷店退款。',
  product: '你负责解答德化陶瓷店商品问题。',
  manager: '你负责综合德化陶瓷店专家的答复。',
};
export const call = (name: string, args: Record<string, unknown> = {}, callId = name) =>
  functionCall(name, args, { callId });
export const step = (...items: AgentInputItem[]) => modelResponse(items);
export const say = (text: string) => step(assistantMessage(text));
export const askRefund = step(call('issue_refund', { orderId, amount: 100 }));

export function ledger(dir: string) {
  const path = join(dir, 'ledger.jsonl');
  return {
    async append(args: z.infer<typeof refundArgs>) {
      await mkdir(dir, { recursive: true });
      await appendFile(path, JSON.stringify({ ...args, at: new Date().toISOString() }) + '\n');
      return '退款已记账';
    },
    async rows(): Promise<Array<z.infer<typeof refundArgs>>> {
      try {
        return (await readFile(path, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    },
  };
}

type Scripts = Partial<Record<keyof typeof instructions, Iterable<ScriptedModelInput>>>;
export function buildGraph(scripts: Scripts = {}, dir = '.data', options: { orderApproval?: boolean; renameRefund?: boolean } = {}) {
  const models = {
    triage: new ScriptedModel(scripts.triage),
    order: new ScriptedModel(scripts.order),
    refund: new ScriptedModel(scripts.refund),
    product: new ScriptedModel(scripts.product),
    manager: new ScriptedModel(scripts.manager),
  };
  const counts = { orders: 0 };
  const getOrder = tool({
    name: 'get_order', description: '查询订单', parameters: orderArgs,
    needsApproval: options.orderApproval,
    execute: ({ orderId }) => {
      counts.orders++;
      return { orderId, item: '白瓷茶杯', refundable: true };
    },
  });
  const book = ledger(dir);
  const issueRefund = tool({
    name: 'issue_refund', description: '发起退款', parameters: refundArgs,
    needsApproval: true, execute: book.append,
  });
  const order = new Agent({ name: 'Order agent', instructions: instructions.order, model: models.order, tools: [getOrder] });
  const refund = new Agent({ name: options.renameRefund ? 'Renamed refund' : 'Refund agent', instructions: instructions.refund, model: models.refund, tools: [issueRefund] });
  const product = new Agent({ name: 'Product agent', instructions: instructions.product, model: models.product });
  const triage = new Agent({ name: 'Triage agent', instructions: instructions.triage, model: models.triage, handoffs: [handoff(order, { toolNameOverride: 'transfer_to_order_agent' }), handoff(refund, { toolNameOverride: 'transfer_to_refund_agent' }), handoff(product, { toolNameOverride: 'transfer_to_product_agent' })], tools: options.orderApproval ? [getOrder] : [] });
  const manager = new Agent({
    name: 'Manager agent', instructions: instructions.manager, model: models.manager,
    tools: [order.asTool({ toolName: 'order_expert' }), refund.asTool({ toolName: 'refund_expert' }), product.asTool({ toolName: 'product_expert' })],
  });
  return { triage, order, refund, product, manager, getOrder, models, counts, book };
}
