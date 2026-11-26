import { experimental_createMCPEventWebhook } from '@ai-sdk/mcp';
import { runAgent } from '../../../lib/agent';
import { store } from '../../../lib/event-store';
import { change, wire } from '../../../lib/storage';

export const POST = experimental_createMCPEventWebhook({
  store,
  async onEvent({ subscription, event }) {
    wire({ kind: 'onEvent', subscriptionId: subscription.id, event });
    const key = subscription.id + ':' + event.eventId;
    await change<Record<string, boolean>, void>('handled', {}, async data => {
      if (Object.hasOwn(data, key)) return;
      const agent = await runAgent(process.env.PORT ?? '3201', 'get_order', { orderId: event.data.orderId });
      data[key] = true;
      wire({ kind: 'business', subscriptionId: subscription.id, eventId: event.eventId, agent });
    });
  },
  async onGap({ subscription, gap }) {
    wire({ kind: 'gap', subscriptionId: subscription.id, cursor: gap.cursor });
  },
  async onTerminated({ subscription, termination }) {
    wire({ kind: 'terminated', subscriptionId: subscription.id, code: termination.error.code });
  },
});
