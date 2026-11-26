import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';

const ports = [3201, 3202];
const next = 'node_modules/next/dist/bin/next';
const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };

export default async function setup() {
  const phase = process.env.DEMO_PHASE ?? 'extensions';
  await Promise.all(ports.map(async port => {
    const listener = createServer().listen(port, '127.0.0.1');
    try { await once(listener, 'listening'); }
    catch (cause) { throw new Error('实验端口 127.0.0.1:' + port + ' 被占用或不可用', { cause }); }
    await new Promise<void>(resolve => listener.close(() => resolve()));
  }));
  if (phase === 'extensions') {
    for (const path of ['.data', 'results/run.json', ...ports.map(port => 'results/wire-' + port + '.jsonl')]) {
      rmSync(path, { recursive: true, force: true });
    }
    mkdirSync('results', { recursive: true });
    const child = spawn(process.execPath, [next, 'build'], { env, stdio: 'inherit' });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error('next build exited ' + code);
  }

  const children = ports.map(port => spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', String(port)], {
    env: { ...env, PORT: String(port), DEMO_TEST: '1', EVENTS_CAP: phase, TASK_STORE: phase === 'none' ? 'memory' : 'file' },
    stdio: 'inherit',
  }));
  async function teardown() {
    await Promise.all(children.map(async child => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const done = once(child, 'exit');
      child.kill('SIGTERM');
      const timeout = globalThis.setTimeout(() => child.kill('SIGKILL'), 5000);
      try { await done; } finally { clearTimeout(timeout); }
    }));
  }

  try {
    await Promise.all(ports.map(async (port, index) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (children[index].exitCode !== null) break;
        const response = await fetch('http://127.0.0.1:' + port, { signal: AbortSignal.timeout(500) }).catch(() => null);
        if (response?.ok) {
          await response.body?.cancel();
          return;
        }
        await setTimeout(100);
      }
      throw new Error('next start 未能启动，端口 ' + port);
    }));
  } catch (error) {
    await teardown();
    throw error;
  }
  return teardown;
}
