import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';

export function read<T>(path: string, initial: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return initial;
    throw error;
  }
}

// Demo-only local filesystem transaction. Production needs a database and worker.
export async function change<T, R>(name: string, initial: T, mutate: (data: T) => R | Promise<R>): Promise<R> {
  mkdirSync('.data', { recursive: true, mode: 0o700 });
  const path = '.data/' + name + '.json';
  const lock = path + '.lock';
  const deadline = Date.now() + 3000;
  while (true) {
    try {
      mkdirSync(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || Date.now() >= deadline) throw error;
      await setTimeout(5);
    }
  }
  const temporary = path + '.' + randomUUID();
  try {
    const data = read(path, initial);
    const result = await mutate(data);
    writeFileSync(temporary, JSON.stringify(data), { mode: 0o600 });
    renameSync(temporary, path);
    return result;
  } finally {
    rmSync(temporary, { force: true });
    rmSync(lock, { recursive: true });
  }
}

export function wire(data: object) {
  const port = process.env.PORT ?? '3201';
  mkdirSync('results', { recursive: true });
  appendFileSync('results/wire-' + port + '.jsonl', JSON.stringify({ at: Date.now(), port, ...data }) + '\n');
}
