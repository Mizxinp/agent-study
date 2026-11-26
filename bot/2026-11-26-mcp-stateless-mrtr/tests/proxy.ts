import { appendFileSync } from 'node:fs';
import { createServer, request, type IncomingMessage, type ServerResponse } from 'node:http';
import { once } from 'node:events';

export const wirePath = 'results/wire-log.jsonl';

export async function startProxy(port: number, backends: readonly [number, number]) {
  let sequence = 0;
  const server = createServer((incoming: IncomingMessage, outgoing: ServerResponse) => {
    const index = sequence++;
    const backend = backends[index % 2];
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    const upstream = request({
      hostname: '127.0.0.1', port: backend, path: incoming.url,
      method: incoming.method, headers: incoming.headers,
    }, response => {
      const raw = Buffer.concat(chunks).toString();
      let body;
      try { body = JSON.parse(raw) ?? {}; } catch { body = {}; }
      appendFileSync(wirePath, JSON.stringify({
        proxy: port, sequence: index, instance: backend, http: incoming.method,
        protocol: incoming.headers['mcp-protocol-version'] ?? null,
        methodHeader: incoming.headers['mcp-method'] ?? null,
        nameHeader: incoming.headers['mcp-name'] ?? null,
        requestSession: 'mcp-session-id' in incoming.headers,
        responseSession: 'mcp-session-id' in response.headers,
        method: body.method ?? null, id: body.id ?? null,
        hasMeta: !!body.params?._meta,
        hasResponses: !!body.params?.inputResponses,
        hasState: typeof body.params?.requestState === 'string',
        status: response.statusCode,
      }) + '\n');
      outgoing.writeHead(response.statusCode!, response.headers);
      response.pipe(outgoing);
    });
    upstream.on('error', () => {
      if (!outgoing.headersSent) outgoing.writeHead(502);
      outgoing.end();
    });
    outgoing.on('close', () => upstream.destroy());
    incoming.pipe(upstream);
  });
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  return async () => {
    const closed = new Promise<void>((resolve, reject) =>
      server.close(error => error ? reject(error) : resolve()));
    server.closeAllConnections();
    await closed;
  };
}
