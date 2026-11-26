import { createHash, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { setTimeout } from 'node:timers/promises';
import {
  acceptedContent, createMcpHandler, createRequestStateCodec, inputRequired,
  McpServer, ProtocolError, ProtocolErrorCode,
} from '@modelcontextprotocol/server';
import type { McpRequestContext, ServerContext } from '@modelcontextprotocol/server';
import * as z from 'zod';

export const runtime = 'nodejs';

const skuSchema = z.object({ sku: z.string().min(1) });
const priceSchema = skuSchema.extend({ newPrice: z.number().positive() });
const confirmSchema = z.object({ confirm: z.boolean() });
type PriceState = z.infer<typeof priceSchema> & { step: 'confirm'; argsDigest: string };

const prices = new Map<string, number>();
const applied = new Map<string, number>();
const bind = (ctx: ServerContext) => JSON.stringify([
  ctx.mcpReq.method, ctx.http?.req?.headers.get('mcp-name'), user(ctx.http?.req?.headers),
]);

function user(headers?: Headers) {
  return headers?.get('x-demo-user') ?? 'demo';
}

function makeCodecs() {
  const key = process.env.MCP_DEMO_KEY_MODE === 'local'
    ? randomBytes(32)
    : Buffer.from(process.env.MCP_STATE_KEY ?? '', 'base64url');
  if (key.byteLength !== 32) throw new Error('MCP state key must contain 32 bytes');
  return {
    standard: createRequestStateCodec<PriceState>({ key, bind }),
    short: createRequestStateCodec<PriceState>({
      key, bind, ttlSeconds: Number(process.env.MCP_DEMO_SHORT_TTL ?? 600),
    }),
  };
}

let codecs: ReturnType<typeof makeCodecs> | undefined;

function output(data: object) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

function factory({ requestInfo }: McpRequestContext) {
  const port = Number(process.env.PORT);
  const principal = user(requestInfo?.headers);
  const state = codecs ??= makeCodecs();
  const server = new McpServer({ name: 'dehua-ceramics', version: '1.0.0' }, {
    capabilities: { tools: { listChanged: true } },
    requestState: { verify: state.standard.verify },
  });

  server.registerTool('get_sku', {
    description: 'Read a sample Dehua porcelain SKU',
    inputSchema: skuSchema,
    annotations: { readOnlyHint: true },
  }, async ({ sku }) => output({ sku, title: '德化白瓷杯', price: prices.get(sku) ?? 88, port }));

  server.registerTool('update_price', {
    description: 'Confirm and update a sample price',
    inputSchema: priceSchema,
  }, async ({ sku, newPrice }, ctx) => {
    const argsDigest = createHash('sha256').update(JSON.stringify([sku, newPrice])).digest('hex');
    const previous = ctx.mcpReq.requestState<PriceState>();
    if (!previous) {
      const codec = sku === 'CUP-TTL' ? state.short : state.standard;
      return inputRequired({
        inputRequests: {
          confirm: inputRequired.elicit({ message: `确认将 ${sku} 改价为 ${newPrice} 元？`, requestedSchema: confirmSchema }),
        },
        requestState: await codec.mint({ step: 'confirm', sku, newPrice, argsDigest }, ctx),
      });
    }
    if (previous.step !== 'confirm' || previous.argsDigest !== argsDigest) {
      throw new ProtocolError(ProtocolErrorCode.InvalidParams, 'Price arguments differ from signed state');
    }
    const confirmation = acceptedContent(ctx.mcpReq.inputResponses, 'confirm', confirmSchema);
    if (!confirmation?.confirm) return output({ applied: false, declined: true, port });

    const operation = JSON.stringify([sku, newPrice, principal]);
    const duplicate = applied.has(operation);
    if (!duplicate) {
      prices.set(sku, newPrice);
      applied.set(operation, newPrice);
    }
    return output({ applied: !duplicate, duplicate, sku, newPrice, port });
  });

  server.registerTool('ask_model', { description: 'Request embedded sampling' }, async () => inputRequired({
    inputRequests: {
      sample: {
        method: 'sampling/createMessage',
        params: {
          messages: [{ role: 'user', content: { type: 'text', text: 'Describe porcelain.' } }],
          maxTokens: 20,
        },
      },
    },
  }));

  server.registerTool('touch_catalog', { description: 'Publish a catalog change event' }, async () => {
    handler.notify.toolsChanged();
    return output({ port });
  });

  server.registerTool('slow_export', { description: 'Export in 30 steps' }, async (ctx) => {
    const { signal, _meta } = ctx.mcpReq;
    const progressToken = _meta?.progressToken;
    let progress = 0;
    let cancelledAt: number | undefined = signal.aborted ? Date.now() : undefined;
    const observeAbort = () => { cancelledAt = Date.now(); };
    signal.addEventListener('abort', observeAbort, { once: true });
    try {
      while (progress < 30) {
        await setTimeout(100, undefined, { signal });
        progress++;
        if (progressToken !== undefined) {
          await ctx.mcpReq.notify({ method: 'notifications/progress', params: { progressToken, progress, total: 30 } });
        }
      }
    } catch (error) {
      if (!signal.aborted) throw error;
    } finally {
      signal.removeEventListener('abort', observeAbort);
      if (process.env.MCP_DEMO_RECORD_EXPORT === '1') {
        writeFileSync(`results/export-${port}.json`, JSON.stringify({
          at: cancelledAt ?? Date.now(), progress, cancelled: signal.aborted,
        }));
      }
    }
    return output({ progress, port });
  });

  return server;
}

const handler = createMcpHandler(factory, process.env.MCP_DEMO_REJECT_LEGACY === '1'
  ? { legacy: 'reject' } : {});

export const POST = (request: Request) => handler.fetch(request);
export const GET = POST;
export const DELETE = POST;
