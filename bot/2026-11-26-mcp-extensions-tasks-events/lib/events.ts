import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { change, read, wire } from './storage';
import { complete, RpcError, stringParam } from './protocol';

function schema(...fields: string[]) {
  return { type: 'object', properties: Object.fromEntries(fields.map(field => [field, { type: field === 'amount' ? 'number' : 'string' }])), required: fields };
}

const definitions = [
  { name: 'order.created', delivery: ['poll', 'webhook'], inputSchema: schema('shopId'), payloadSchema: schema('orderId', 'shopId', 'amount') },
  { name: 'stock.low', delivery: ['poll'], inputSchema: schema('sku'), payloadSchema: schema('sku') },
];
type Event = { eventId: string; name: string; timestamp: string; data: { orderId: string; shopId: string; amount: number }; cursor: string };
type Subscription = { id: string; name: string; argument: string; url: string; secret: string; refreshBefore: string; pending: number[] };
type State = { subscriptions: Record<string, Subscription>; events: Event[] };
const initial = (): State => ({ subscriptions: {}, events: [] });
const state = () => read('.data/events.json', initial());
const mutate = <T>(fn: (data: State) => T) => change('events', initial(), fn);
type Params = Record<string, unknown>;
type Message = { id: string; payload: object };
const randomMessageId = () => randomBytes(24).toString('base64url');
const callbackError = (reason: 'connection_refused' | 'timeout' | 'tls_error' | 'challenge_failed') =>
  new RpcError(-32027, 'Callback verification failed', { reason });

type Variant = 'replay' | 'signature' | 'timestamp' | 'subscription' | 'expired';

function argument(name: string, args: unknown) {
  if (!definitions.some(event => event.name === name)) throw new RpcError(-32023, 'Unknown event');
  return stringParam((args as Params | undefined)?.[name === 'stock.low' ? 'sku' : 'shopId']);
}
function cursorIndex(value: unknown, length: number) {
  if (value == null) return length;
  if (typeof value !== 'string' || !/^\d+$/.test(value) || +value > length) {
    throw new RpcError(-32602, 'Invalid cursor');
  }
  return +value;
}
function subscriptionId(name: string, filter: string, url: string) {
  return createHash('sha256').update(JSON.stringify([name, filter, url])).digest('hex');
}
function secretBytes(secret: string) {
  if (!/^whsec_[A-Za-z0-9+/]+={0,2}$/.test(secret)) throw new RpcError(-32602, 'Invalid webhook secret');
  const bytes = Buffer.from(secret.slice(6), 'base64');
  if (bytes.length < 24 || bytes.length > 64) throw new RpcError(-32602, 'Invalid webhook secret length');
  return bytes;
}

async function deliver(sub: Subscription, message: Message, variant?: Variant) {
  const url = new URL(sub.url);
  // The fixture has no external callback egress, including redirects.
  if (!['127.0.0.1', '[::1]'].includes(url.hostname)) throw callbackError('connection_refused');
  const verification = 'challenge' in message.payload;
  const body = JSON.stringify(message.payload);
  const timestamp = Math.floor(Date.now() / 1000) - (variant === 'timestamp' ? 360 : 0);
  const signature = createHmac('sha256', secretBytes(sub.secret))
    .update(message.id + '.' + timestamp + '.' + body).digest('base64');
  const response = await fetch(url, {
    method: 'POST', body, redirect: 'error', signal: AbortSignal.timeout(3000),
    headers: {
      'content-type': 'application/json', 'webhook-id': message.id, 'webhook-timestamp': String(timestamp),
      'webhook-signature': 'v1,' + (variant === 'signature' ? Buffer.alloc(32).toString('base64') : signature),
      'X-MCP-Subscription-Id': variant === 'subscription' ? randomUUID() : sub.id,
    },
  }).catch((error: Error & { cause?: { code?: string } }) => {
    if (verification) {
      const code = error.cause?.code ?? '';
      if (error.name === 'TimeoutError' || code.endsWith('_TIMEOUT')) throw callbackError('timeout');
      if (/TLS|SSL|CERT/.test(code)) throw callbackError('tls_error');
      throw callbackError('connection_refused');
    }
    return new Response(null, { status: 503 });
  });
  wire({ kind: 'delivery', status: response.status, messageId: message.id,
    subscriptionId: sub.id, eventId: 'eventId' in message.payload ? message.payload.eventId : undefined, verification, variant });
  return response;
}

async function retry(sub: Subscription, message: Message, prior?: number) {
  const statuses = prior === undefined ? [(await deliver(sub, message)).status] : [prior];
  for (const delay of [200, 400, 800]) {
    const status = statuses.at(-1)!;
    if ((status >= 200 && status < 300) || status === 410) break;
    await setTimeout(delay);
    statuses.push((await deliver(sub, message)).status);
  }
  return statuses;
}

async function createEvent(shopId: string) {
  return mutate(data => {
    const event: Event = {
      eventId: randomUUID(), name: 'order.created', timestamp: new Date().toISOString(),
      data: { orderId: 'DH-' + randomUUID(), shopId, amount: 128 }, cursor: String(data.events.length + 1),
    };
    data.events.push(event);
    const subscriptions = Object.values(data.subscriptions).filter(sub =>
      sub.name === event.name && sub.argument === shopId && Date.parse(sub.refreshBefore) > Date.now());
    for (const sub of subscriptions) sub.pending.push(Number(event.cursor));
    return { event, subscriptions };
  });
}

function queuedMessage(sub: Subscription, event: Event) {
  const pending = state().subscriptions[sub.id]?.pending ?? [];
  const previous = pending.filter(position => position < Number(event.cursor));
  const cursor = previous.length ? String(Math.min(...previous) - 1) : event.cursor;
  return { id: randomMessageId(), payload: { ...event, cursor } };
}

async function finishDelivery(sub: Subscription, event: Event, message: Message, prior?: number) {
  const statuses = await retry(sub, message, prior);
  await mutate(data => {
    const current = data.subscriptions[sub.id];
    if (current) current.pending = current.pending.filter(position => position !== Number(event.cursor));
  });
  return statuses;
}

export async function createOrder(shopId: string) {
  const { event, subscriptions } = await createEvent(shopId);
  const deliveries = await Promise.all(subscriptions.map(async sub => {
    const message = queuedMessage(sub, event);
    return { id: sub.id, webhookId: message.id, statuses: await finishDelivery(sub, event, message) };
  }));
  return { event, deliveries };
}

export async function debugDelivery(id: string, eventId: string, variant: Variant, replayId?: unknown) {
  const data = state();
  const sub = data.subscriptions[id];
  const event = data.events.find(item => item.eventId === eventId);
  if (!sub || !event || event.name !== sub.name || event.data.shopId !== sub.argument) {
    throw new RpcError(-32023, 'Missing fixture event or subscription');
  }
  const webhookId = variant === 'replay' ? stringParam(replayId) : randomMessageId();
  if (!/^[A-Za-z0-9_-]+$/.test(webhookId) || webhookId.includes(eventId)) {
    throw new RpcError(-32602, 'Invalid fixture webhook ID');
  }
  return { status: (await deliver(sub, { id: webhookId, payload: event }, variant)).status };
}

export async function eventsRpc(method: string, params: Params) {
  if (method === 'events/list') return complete({ events: definitions });
  if (!['events/poll', 'events/subscribe', 'events/unsubscribe'].includes(method)) {
    throw new RpcError(-32601, 'Method not found');
  }
  const name = stringParam(params.name);
  const filter = argument(name, params.arguments);
  if (method === 'events/poll') {
    const { events } = state();
    const start = cursorIndex(params.cursor, events.length);
    const limit = params.maxEvents ?? 50;
    const age = params.maxAgeMs ?? Infinity;
    if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 1 || typeof age !== 'number' || age < 0) {
      throw new RpcError(-32602, 'Invalid poll limits');
    }
    const matching = events.slice(start).filter(event =>
      event.name === name && event.data.shopId === filter && Date.now() - Date.parse(event.timestamp) <= age);
    const page = matching.slice(0, limit);
    const hasMore = matching.length > limit;
    return complete({ events: page, cursor: hasMore ? page.at(-1)!.cursor : String(events.length),
      hasMore, truncated: events.slice(start).some(event =>
        event.name === name && event.data.shopId === filter && Date.now() - Date.parse(event.timestamp) > age), nextPollMs: 200 });
  }
  const delivery = params.delivery as Params | undefined;
  const rawUrl = stringParam(delivery?.url);
  if (method === 'events/unsubscribe') {
    await mutate(data => {
      const id = subscriptionId(name, filter, rawUrl);
      if (!data.subscriptions[id]) throw new RpcError(-32023, 'Subscription not found');
      delete data.subscriptions[id];
    });
    return complete({});
  }
  if (name !== 'order.created' || delivery?.mode !== 'webhook') {
    throw new RpcError(-32026, 'Unsupported delivery', { feature: 'deliveryMode', value: stringParam(delivery?.mode) });
  }
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new RpcError(-32602, 'Invalid callback URL'); }
  const localHttp = /^http:\/\/(127\.0\.0\.1|\[::1\])(?=[:/]|$)/.test(rawUrl);
  if ((url.protocol !== 'https:' && !localHttp) || url.username || url.password || url.hash) {
    throw new RpcError(-32602, 'Expected HTTPS or literal loopback HTTP');
  }
  const secret = stringParam(delivery.secret);
  secretBytes(secret);
  const ttl = params.ttlMs ?? 60000;
  if (typeof ttl !== 'number' || !Number.isSafeInteger(ttl) || ttl < 1) throw new RpcError(-32602, 'Invalid TTL');
  const id = subscriptionId(name, filter, url.href);
  const sub: Subscription = { id, name, argument: filter, url: url.href, secret, pending: [], refreshBefore: new Date(Date.now() + Math.min(ttl, 60000)).toISOString() };
  const challenge = randomUUID();
  const messageId = 'msg_verification_' + randomMessageId();
  const verified = await deliver(sub, { id: messageId, payload: { type: 'verification', challenge } });
  const echo: unknown = await verified.json().then(value => value?.challenge).catch(() => undefined);
  const expected = Buffer.from(challenge);
  const received = Buffer.from(typeof echo === 'string' ? echo : '');
  const matched = verified.ok && expected.length === received.length && timingSafeEqual(expected, received);
  wire({ kind: 'verification', matched, messageId, subscriptionId: sub.id });
  if (!matched) throw callbackError('challenge_failed');

  const snapshot = await mutate(data => {
    const position = cursorIndex(params.cursor, data.events.length);
    const previous = data.subscriptions[id];
    const live = previous && Date.parse(previous.refreshBefore) > Date.now();
    const maxAge = params.maxAgeMs ?? Infinity;
    if (typeof maxAge !== 'number' || maxAge < 0) throw new RpcError(-32602, 'Invalid replay age');
    const matching = live ? [] : data.events.slice(position).filter(event => event.name === name && event.data.shopId === filter);
    const replay = matching.filter(event => Date.now() - Date.parse(event.timestamp) <= maxAge);
    sub.pending = live ? previous.pending : replay.map(event => Number(event.cursor));
    data.subscriptions[id] = sub;
    return { cursor: String(sub.pending.length ? Math.min(...sub.pending) - 1 : data.events.length),
      replay, truncated: matching.length !== replay.length };
  });
  if (process.env.DEMO_TEST === '1' && filter === 'dehua-race') {
    const { event } = await createEvent(filter);
    const message = queuedMessage(sub, event);
    const status = (await deliver(sub, message)).status;
    void finishDelivery(sub, event, message, status).catch(() => console.error('Race delivery failed'));
  }
  if (snapshot.replay.length) {
    void (async () => {
      await setTimeout(200);
      for (const event of snapshot.replay) await finishDelivery(sub, event, queuedMessage(sub, event));
    })().catch(() => console.error('Replay delivery failed'));
  }
  return complete({ id, refreshBefore: sub.refreshBefore, cursor: snapshot.cursor, truncated: snapshot.truncated });
}
