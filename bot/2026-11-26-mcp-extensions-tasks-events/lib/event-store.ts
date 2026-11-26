import type { Experimental_MCPEventStore, Experimental_MCPEventSubscription } from '@ai-sdk/mcp';
import { change, read, wire } from './storage';

type Subscriptions = Record<string, Experimental_MCPEventSubscription>;
const readStore = () => read<Subscriptions>('.data/client-subscriptions.json', {});
const updateStore = <T>(fn: (state: Subscriptions) => T) => change('client-subscriptions', {}, fn);

export const store: Experimental_MCPEventStore = {
  async get(key) {
    const state = readStore();
    return Object.hasOwn(state, key) ? state[key] : undefined;
  },
  async getById(id) {
    return Object.values(readStore()).find(record => record.id === id);
  },
  async set(subscription) {
    await updateStore(state => { state[subscription.key] = subscription; });
    wire({ kind: 'subscription-store', status: subscription.status });
  },
  async update(key, patch) {
    await updateStore(state => {
      if (!Object.hasOwn(state, key)) throw new Error('Missing subscription');
      state[key] = { ...state[key], ...patch };
    });
    if (patch.status) wire({ kind: 'subscription-store', status: patch.status });
  },
  async delete(key) {
    await updateStore(state => { delete state[key]; });
  },
};
