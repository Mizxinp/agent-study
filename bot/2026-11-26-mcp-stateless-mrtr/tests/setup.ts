import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { startProxy, wirePath } from './proxy';

const primary = [3100, 3101, 3102] as const;
const control = [3110, 3111, 3112] as const;
const next = 'node_modules/next/dist/bin/next';
const buildEnv = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };

async function checkPort(port: number) {
  const listener = createServer().listen(port, '127.0.0.1');
  try {
    await once(listener, 'listening');
  } catch (error) {
    throw new Error(`实验端口 ${port} 不可用，请释放 127.0.0.1:${port}`, { cause: error });
  }
  await new Promise<void>(resolve => listener.close(() => resolve()));
}

export default async function setup() {
  await Promise.all([...primary, ...control].map(checkPort));
  mkdirSync('results', { recursive: true });
  for (const path of ['results/run.json', ...[3101, 3102].map(port => `results/export-${port}.json`)]) {
    rmSync(path, { force: true });
  }
  writeFileSync(wirePath, '');
  const build = spawn(process.execPath, [next, 'build'], { env: buildEnv, stdio: 'inherit' });
  const [code] = await once(build, 'exit');
  if (code !== 0) throw new Error(`next build exited ${code}`);

  const key = randomBytes(32).toString('base64url');
  const disposers: (() => Promise<void>)[] = [];
  const teardown = async () => {
    for (const close of disposers.reverse()) await close();
  };

  async function start(port: number, comparison: boolean) {
    const env = {
      ...buildEnv, PORT: String(port),
      ...(comparison
        ? { MCP_STATE_KEY: '', MCP_DEMO_KEY_MODE: 'local', MCP_DEMO_REJECT_LEGACY: '1' }
        : { MCP_STATE_KEY: key, MCP_DEMO_KEY_MODE: 'shared', MCP_DEMO_REJECT_LEGACY: '0' }),
      MCP_DEMO_SHORT_TTL: '1', MCP_DEMO_RECORD_EXPORT: '1',
    };
    const child = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', String(port)], {
      env, stdio: 'inherit',
    });
    disposers.push(async () => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const done = once(child, 'exit');
      child.kill('SIGTERM');
      const escalation = globalThis.setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await done; } finally { clearTimeout(escalation); }
    });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error(`next start failed on port ${port}`);
      const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(500) }).catch(() => null);
      if (response?.ok) {
        await response.body?.cancel();
        return;
      }
      await setTimeout(100);
    }
    throw new Error(`next start did not become ready on port ${port}`);
  }

  try {
    for (const [proxy, left, right] of [primary, control]) {
      await start(left, proxy === control[0]);
      await start(right, proxy === control[0]);
      disposers.push(await startProxy(proxy, [left, right]));
    }
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
