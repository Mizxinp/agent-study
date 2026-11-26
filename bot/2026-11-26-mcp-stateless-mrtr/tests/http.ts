import { readFileSync } from 'node:fs';
import { Client, StreamableHTTPClientTransport, type ClientOptions } from '@modelcontextprotocol/client';
import { wirePath } from './proxy';

export const version = '2026-07-28';
export const versionKey = 'io.modelcontextprotocol/protocolVersion';
export const capabilityKey = 'io.modelcontextprotocol/clientCapabilities';
export const pin = { versionNegotiation: { mode: { pin: version } } } satisfies ClientOptions;
export const endpoint = (port: number) => `http://127.0.0.1:${port}/api/mcp`;

export interface WireRow {
  proxy: number;
  instance: number;
  method: string | null;
  protocol: string | null;
  methodHeader: string | null;
  nameHeader: string | null;
  requestSession: boolean;
  responseSession: boolean;
  id: number | string | null;
  hasMeta: boolean;
  hasResponses: boolean;
  hasState: boolean;
  status: number;
}

export function wire(): WireRow[] {
  return readFileSync(wirePath, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));
}

export function client(options?: ClientOptions) {
  return new Client({ name: 'dehua-test', version: '1.0.0' }, options);
}

export function connect(value: Client, port = 3100) {
  return value.connect(new StreamableHTTPClientTransport(new URL(endpoint(port))));
}

export function toolData(result: { content?: Array<{ type: string; text?: string }> }) {
  return JSON.parse(result.content?.find(entry => entry.type === 'text')?.text ?? '');
}

let id = 100;

export function post(port: number, method: string, params: Record<string, unknown> = {}, options: {
  version?: string; methodHeader?: string; nameHeader?: string; notification?: boolean;
  user?: string; signal?: AbortSignal;
} = {}) {
  const revision = options.version ?? version;
  return fetch(endpoint(port), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': revision,
      'Mcp-Method': options.methodHeader ?? method,
      ...(typeof params.name === 'string' && { 'Mcp-Name': options.nameHeader ?? params.name }),
      'x-demo-user': options.user ?? 'demo',
    },
    body: JSON.stringify({
      jsonrpc: '2.0', ...(!options.notification && { id: ++id }), method,
      params: {
        ...params,
        _meta: { [versionKey]: revision, [capabilityKey]: { elicitation: { form: {} } } },
      },
    }),
    signal: options.signal ?? AbortSignal.timeout(6000),
  });
}

// Only parse data fields. SDK keepalive comments do not count as messages.
export async function* sse(response: Response) {
  const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      pending += value;
      let end: number;
      while ((end = pending.indexOf('\n\n')) >= 0) {
        const frame = pending.slice(0, end);
        pending = pending.slice(end + 2);
        const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5)).join('\n');
        if (data) yield JSON.parse(data);
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function describeResponse(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';
  const text = contentType.includes('text/event-stream') ? '' : await response.text();
  let body = text ? JSON.parse(text) : null;
  if (contentType.includes('text/event-stream')) {
    for await (const message of sse(response)) {
      if (message.result || message.error) {
        body = message;
        break;
      }
    }
  }
  return { status: response.status, allow: response.headers.get('allow'), body };
}
