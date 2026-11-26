import { CAPS_KEY, EVENTS, TASKS, VERSION, VERSION_KEY, RpcError, complete, stringParam, tool } from '../../../lib/protocol';
import { cancelTask, exportAssets, getTask, requireTasks } from '../../../lib/tasks';
import { createOrder, debugDelivery, eventsRpc } from '../../../lib/events';
import { wire } from '../../../lib/storage';
import { z } from 'zod';

const discoverInfo = 'io.modelcontextprotocol/serverInfo';
const fixtures = [
  ['get_order', 'orderId', 'string'],
  ['export_assets', 'count', 'integer'],
  ['create_order', 'shopId', 'string'],
].map(([name, field, type]) => ({
  name, description: name,
  inputSchema: { type: 'object', properties: { [field]: { type } }, required: [field] },
}));
const requestSchema = z.object({
  jsonrpc: z.literal('2.0'), id: z.union([z.string(), z.number()]), method: z.string(),
  params: z.looseObject({ _meta: z.record(z.string(), z.unknown()).optional() }).optional(),
});

function discovery() {
  const mode = process.env.EVENTS_CAP ?? 'extensions';
  const extensions = { [TASKS]: {}, ...(mode === 'extensions' ? { [EVENTS]: { listChanged: false } } : {}) };
  return complete({
    supportedVersions: [VERSION], capabilities: { tools: {}, extensions, ...(mode === 'legacy' ? { events: {} } : {}) },
    ttlMs: 60000, cacheScope: 'public', _meta: { [discoverInfo]: { name: 'extensions-demo', version: '1.0.0' } },
  });
}

async function dispatch(method: string, params: Record<string, unknown>, extensions: Record<string, unknown>, short: boolean) {
  const args = (params.arguments ?? {}) as Record<string, unknown>;
  if (taskMethods.has(method)) requireTasks(extensions);
  switch (method) {
    case 'server/discover': return discovery();
    case 'tools/list': return complete({ tools: fixtures });
    case 'tools/call':
      switch (params.name) {
        case 'get_order': return tool({ orderId: stringParam(args.orderId), state: 'paid', amount: 128, port: process.env.PORT });
        case 'export_assets': return exportAssets(args.count, extensions, short);
        case 'create_order': return tool(await createOrder(stringParam(args.shopId)));
      }
      throw new RpcError(-32602, 'Unknown tool');
    case 'tasks/get': return getTask(stringParam(params.taskId));
    case 'tasks/update':
      getTask(stringParam(params.taskId));
      z.record(z.string(), z.unknown()).parse(params.inputResponses);
      return complete({});
    case 'tasks/cancel': return cancelTask(stringParam(params.taskId));
    case 'demo/deliver': {
      if (process.env.DEMO_TEST !== '1') break;
      const variant = z.enum(['replay', 'signature', 'timestamp', 'subscription', 'expired']).parse(params.variant);
      return complete(await debugDelivery(stringParam(params.subscriptionId), stringParam(params.eventId), variant, params.webhookId));
    }
    default:
      if (method.startsWith('events/') && process.env.EVENTS_CAP !== 'none') return eventsRpc(method, params);
  }
  throw new RpcError(-32601, 'Method not found');
}

const nameMethods = new Set(['tools/call', 'events/subscribe', 'events/unsubscribe', 'events/poll', 'events/stream']);
const taskMethods = new Set(['tasks/get', 'tasks/update', 'tasks/cancel']);
const decode = (value: string | null) => {
  const encoded = value?.match(/^=\?base64\?([A-Za-z0-9+/=]+)\?=$/i);
  return encoded ? Buffer.from(encoded[1], 'base64').toString('utf8') : value;
};

export async function POST(request: Request) {
  const incoming = await request.json().catch(() => undefined);
  const parsed = requestSchema.safeParse(incoming);
  const headers = {
    version: request.headers.get('MCP-Protocol-Version'),
    method: request.headers.get('Mcp-Method'),
    name: request.headers.get('Mcp-Name'),
  };
  let context: object = { kind: 'rpc', headers };
  let id: string | number | null = null;
  try {
    if (!parsed.success) throw new RpcError(incoming === undefined ? -32700 : -32600, 'Invalid JSON-RPC request', undefined, 400);
    const { method, params = {} } = parsed.data;
    id = parsed.data.id;
    const meta = params._meta;
    const caps = z.looseObject({ extensions: z.record(z.string(), z.unknown()).optional() }).safeParse(meta?.[CAPS_KEY]);
    const extensions = caps.success ? caps.data.extensions ?? {} : {};
    const name = (taskMethods.has(method) || method === 'tasks/result') ? params.taskId : nameMethods.has(method) ? params.name : null;
    context = { ...context, eventsCap: process.env.EVENTS_CAP ?? 'extensions', taskStore: process.env.TASK_STORE ?? 'file', method, id, name, extensions: Object.keys(extensions), bodyVersion: meta?.[VERSION_KEY] };
    const requested = meta?.[VERSION_KEY];
    if (!caps.success || typeof requested !== 'string') {
      throw new RpcError(-32602, 'Invalid or missing protocol metadata', undefined, 400);
    }
    if (requested !== headers.version ||
      headers.method !== method || (name === null ? headers.name !== null : typeof name !== 'string' || decode(headers.name) !== name)) {
      throw new RpcError(-32020, 'HTTP headers do not mirror the JSON-RPC request', undefined, 400);
    }
    if (requested !== VERSION) {
      throw new RpcError(-32022, 'Unsupported protocol version', { supported: [VERSION], requested }, 400);
    }
    const result = await dispatch(method, params, extensions,
      process.env.DEMO_TEST === '1' && request.headers.get('x-demo-short-task') === '1');
    wire({ ...context, status: 200, resultType: result.resultType });
    return Response.json({ jsonrpc: '2.0', id, result });
  } catch (cause) {
    const err = cause instanceof RpcError ? cause : cause instanceof z.ZodError
      ? new RpcError(-32602, 'Invalid params') : new RpcError(-32603, 'Internal error');
    wire({ ...context, status: err.status, errorCode: err.code });
    return Response.json({ jsonrpc: '2.0', id, error: { code: err.code, message: err.message, data: err.data } }, { status: err.status });
  }
}

function unsupported(request: Request) {
  wire({ kind: 'http', method: request.method, status: 405 });
  return new Response(null, { status: 405, headers: { Allow: 'POST' } });
}
export const GET = unsupported;
export const DELETE = unsupported;
