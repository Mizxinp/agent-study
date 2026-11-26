import { createMCPClient, MCPClientError } from '@ai-sdk/mcp';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import { expect, test } from 'vitest';
import { runAgent } from '../lib/agent';
import { store } from '../lib/event-store';
import { CAPS_KEY, TASKS, VERSION, VERSION_KEY } from '../lib/protocol';
import { read } from '../lib/storage';

const url = (port: number) => 'http://127.0.0.1:' + port + '/api/mcp';
const phase = process.env.DEMO_PHASE ?? 'extensions';
const observations: Record<string, unknown> = read('results/run.json', {});
const taskExtension = { [TASKS]: {} };

async function rpc(method: string, params: Record<string, unknown> = {}, options: {
  port?: number; tasks?: boolean; omitCapabilities?: boolean; version?: string; headers?: Record<string, string | null>;
} = {}) {
  const port = options.port ?? 3201;
  const id = randomUUID();
  const version = options.version ?? VERSION;
  const headers = new Headers({ 'content-type': 'application/json', 'MCP-Protocol-Version': version, 'Mcp-Method': method });
  const name = params.taskId ?? params.name;
  if (typeof name === 'string') headers.set('Mcp-Name', name);
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (value === null) headers.delete(key);
    else headers.set(key, value);
  }
  const response = await fetch(url(port), {
    method: 'POST', headers, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params: {
      ...params, _meta: {
        [VERSION_KEY]: version,
        ...(options.omitCapabilities ? {} : { [CAPS_KEY]: { extensions: options.tasks ? taskExtension : {} } }),
      },
    } }),
  });
  return { port, status: response.status, body: await response.json() };
}

const exportAssets = (count: number, tasks = true, short = false) =>
  rpc('tools/call', { name: 'export_assets', arguments: { count } }, {
    tasks, headers: short ? { 'x-demo-short-task': '1' } : undefined,
  });
const get = (taskId: string, port: number) => rpc('tasks/get', { taskId }, { port, tasks: true });
async function poll(created: Awaited<ReturnType<typeof rpc>>) {
  const { taskId, pollIntervalMs } = created.body.result ?? {};
  const terminal = ['completed', 'cancelled', 'failed'];
  const when = Date.now();
  const reads = [];
  for (let count = 0; taskId && Date.now() - when < 5000; count++) {
    const reply = await get(taskId, count % 2 === 0 ? 3202 : 3201);
    reads.push(reply);
    if (terminal.includes(reply.body.result?.status) || reply.body.error) break;
    await setTimeout(pollIntervalMs ?? 200);
  }
  return { elapsedMs: Date.now() - when, reads };
}
async function cancellation(count: number, wait: number) {
  const created = await exportAssets(count, true, count === 2);
  await setTimeout(wait);
  const before = count === 2 ? await poll(created) : undefined;
  const ack = await rpc('tasks/cancel', { taskId: created.body.result?.taskId }, { port: 3202, tasks: true });
  return { created, before, ack, lifecycle: await poll(created) };
}
function onEventCount(id: string) {
  return readFileSync('results/wire-3201.jsonl', 'utf8').trim().split('\n')
    .map(line => JSON.parse(line)).filter(row => row.kind === 'onEvent' && row.subscriptionId === id).length;
}
async function capture<T>(operation: () => Promise<T>) {
  try { return { value: await operation() }; }
  catch (error) {
    const err = error as Error;
    return { error: {
      name: err.name, className: err.constructor.name, message: err.message,
      code: MCPClientError.isInstance(err) ? err.code : undefined,
      statusCode: MCPClientError.isInstance(err) ? err.statusCode : undefined,
    } };
  }
}

const clientFor = (capabilities?: { extensions: typeof taskExtension }) =>
  createMCPClient({ transport: { type: 'http', url: url(3201) }, capabilities, experimental_events: { store } });
const callExport = async (tasks: boolean) => {
  const client = await clientFor(tasks ? { extensions: taskExtension } : undefined);
  try { return await capture(() => client.callTool({ name: 'export_assets', arguments: { count: 20 } })); }
  finally { await client.close(); }
};
function resultContent(reply: Awaited<ReturnType<typeof rpc>>) {
  return JSON.parse(reply.body.result.content[0].text);
}
const delivery = { mode: 'webhook' as const, url: 'http://127.0.0.1:3201/api/mcp-events', allowInsecureLocalhost: true };

test('记录预注册实验 ' + phase, async () => {
  const client = await clientFor();
  try {
    const list = await capture(() => client.experimental_events.list());
    if (phase !== 'extensions') {
      observations['H4a-' + phase] = list;
      if (phase === 'none') {
        const created = await exportAssets(20);
        observations.H2f = { created, owner: await get(created.body.result.taskId, 3201), other: await get(created.body.result.taskId, 3202) };
      }
    } else {
      observations['H0-capabilities'] = await rpc('tools/list', {}, { omitCapabilities: true });
      observations['H0-version'] = await rpc('tools/list', {}, { version: '1900-01-01' });
      observations.H1a = [await exportAssets(3, false), await exportAssets(20, false)];
      const created = await exportAssets(20);
      observations.H1b = created;
      observations.H2a = await poll(created);
      observations.H1c = [await exportAssets(20), await exportAssets(20, false)];
      const taskId = created.body.result.taskId;
      for (const method of ['get', 'update', 'cancel']) {
        observations['H1d-' + method] = await rpc('tasks/' + method, { taskId, inputResponses: {} });
      }
      observations.H2b = await Promise.all([null, 'mismatch'].map(name =>
        rpc('tasks/get', { taskId }, { tasks: true, headers: { 'Mcp-Name': name } })));
      observations.H2c = { tool: await poll(await exportAssets(13)), internal: await poll(await exportAssets(99)) };
      observations.H2d = { early: await cancellation(30, 0), late: await cancellation(2, 250) };
      observations.H2e = [await get(randomUUID(), 3201), await rpc('tasks/result', { taskId }, { tasks: true })];
      observations.H3a = await callExport(false);
      observations.H3b = await callExport(true);
      observations.H3c = await runAgent('3201', 'export_assets', { count: 3 });
      observations['H4a-extensions'] = list;
      observations.H4b = {
        stock: await capture(() => client.experimental_events.subscribe({ name: 'stock.low', arguments: { sku: 'a' }, delivery })),
        mode: await capture(() => client.experimental_events.subscribe({ name: 'order.created', delivery: { ...delivery, mode: 'poll' as 'webhook' } })),
        hostname: await capture(() => client.experimental_events.subscribe({ name: 'order.created', delivery: { ...delivery, url: delivery.url.replace('127.0.0.1', 'localhost') } })),
      };
      const secret = 'whsec_' + randomBytes(24).toString('base64');
      observations['H4i-unsupported'] = await rpc('events/subscribe', {
        name: 'stock.low', arguments: { sku: 'a' }, delivery: { ...delivery, secret },
      });
      observations['H4i-callback'] = await rpc('events/subscribe', {
        name: 'order.created', arguments: { shopId: 'verification-failure' }, delivery: { ...delivery, secret },
      });
      const subscribe = (shopId: string) => client.experimental_events.subscribe({ name: 'order.created', arguments: { shopId }, delivery });
      const sub = await subscribe('dehua-01');
      const order = resultContent(await rpc('tools/call', { name: 'create_order', arguments: { shopId: 'dehua-01' } }, { port: 3202 }));
      const active = await store.getById(sub.id);
      observations.H4c = { subscription: sub, order, onEvent: onEventCount(sub.id), active: { status: active?.status, cursor: active?.cursor } };
      const webhookId = order.deliveries.find((item: { id: string }) => item.id === sub.id)?.webhookId;
      const debug = async (variant: string, replayId?: string) => (await rpc('demo/deliver', {
        subscriptionId: sub.id, eventId: order.event.eventId, variant, webhookId: replayId,
      }, { port: 3202 })).body.result?.status;
      const beforeRejections = onEventCount(sub.id);
      const rejected = {
        signature: await debug('signature'), timestamp: await debug('timestamp'), subscription: await debug('subscription'),
      };
      observations.H4d = { statuses: Object.values(rejected), onEvent: onEventCount(sub.id) - beforeRejections };
      const race = await subscribe('dehua-race');
      const deadline = Date.now() + 2100;
      let raceRecord = await store.getById(race.id);
      while (raceRecord?.cursor === race.cursor && Date.now() < deadline) {
        await setTimeout(40);
        raceRecord = await store.getById(race.id);
      }
      observations.H4e = { id: race.id, initial: race.cursor, final: (await store.getById(race.id))?.cursor };
      observations.H4f = { replay: await debug('replay', webhookId), webhookId, eventId: order.event.eventId, id: sub.id };
      const expiry = new Date(Date.now() - 1000).toISOString();
      await store.update(active!.key, { refreshBefore: expiry });
      const callsBeforeExpiry = onEventCount(sub.id);
      observations.H4h = { status: await debug('expired'), expiry, onEvent: onEventCount(sub.id) - callsBeforeExpiry };
      await client.experimental_events.unsubscribe({ id: sub.id });
      const missing = await rpc('events/unsubscribe', {
        name: 'order.created', arguments: { shopId: 'dehua-01' }, delivery: { url: active!.delivery.url },
      });
      const polled = await rpc('events/poll', { name: 'order.created', arguments: { shopId: 'dehua-01' }, cursor: '0' });
      const updated = await rpc('tasks/update', { taskId, inputResponses: {} }, { tasks: true });
      expect(missing.body.error.code).toBe(-32023);
      expect(polled.body.result.events[0].eventId).toBe(order.event.eventId);
      expect(updated.body.result).toEqual({ resultType: 'complete' });
      expect((await fetch(url(3201), { method: 'GET' })).status).toBe(405);
      expect((await fetch(url(3201), { method: 'DELETE' })).status).toBe(405);
    }
    writeFileSync('results/run.json', JSON.stringify(observations, null, 2) + '\n');
  } finally {
    await client.close();
  }
});
