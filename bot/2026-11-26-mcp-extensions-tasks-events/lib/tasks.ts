import { randomUUID } from 'node:crypto';
import { change, read } from './storage';
import { RpcError, TASKS, complete, tool } from './protocol';

type Task = {
  taskId: string;
  status: 'working' | 'completed' | 'failed' | 'cancelled';
  ttlMs: number;
  pollIntervalMs: number;
  statusMessage: string;
  createdAt: string;
  lastUpdatedAt: string;
  count: number;
  progress: number;
  cancellation?: boolean;
  result?: ReturnType<typeof tool>;
  error?: { code: number; message: string };
};

const memory = new Map<string, Task>();
const useMemory = () => process.env.TASK_STORE === 'memory';

function mutate<R>(id: string, fn: (task: Task | undefined) => { task: Task; result: R }): Promise<R> {
  if (useMemory()) {
    const { task, result } = fn(memory.get(id));
    memory.set(id, task);
    return Promise.resolve(result);
  }
  return change<Record<string, Task>, R>('tasks', {}, tasks => {
    const { task, result } = fn(Object.hasOwn(tasks, id) ? tasks[id] : undefined);
    tasks[id] = task;
    return result;
  });
}

function find(task: Task | undefined) {
  if (!task || Date.now() >= Date.parse(task.createdAt) + task.ttlMs) {
    throw new RpcError(-32602, 'Task not found or expired');
  }
  return task;
}

function advance(id: string) {
  setTimeout(async () => {
    try {
      const more = await mutate(id, stored => {
        const task = find(stored);
        task.lastUpdatedAt = new Date().toISOString();
        if (task.cancellation) {
          task.status = 'cancelled';
          task.statusMessage = 'Cancelled';
          return { task, result: false };
        }
        task.progress++;
        task.statusMessage = task.progress + '/' + task.count;
        try {
          if (task.count === 99 && task.progress === 4) throw new Error('Fixture worker error');
          if (task.progress === task.count) {
            task.status = 'completed';
            task.result = tool({ exported: task.count }, task.count === 13);
          }
        } catch (error) {
          task.status = 'failed';
          task.error = { code: -32603, message: (error as Error).message };
        }
        return { task, result: task.status === 'working' };
      });
      if (more) advance(id);
    } catch (error) {
      if (!(error instanceof RpcError)) console.error('Task worker storage failure');
    }
  }, 100).unref();
}

export async function exportAssets(count: unknown, negotiated: boolean, shortFixture: boolean) {
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) {
    throw new RpcError(-32602, 'Expected positive integer count');
  }
  if (count <= 5 && !(shortFixture && count === 2)) return tool({ exported: count });
  if (!negotiated) {
    throw new RpcError(-32021, 'Tasks capability required', { requiredCapabilities: { extensions: { [TASKS]: {} } } });
  }
  const taskId = randomUUID();
  const now = new Date().toISOString();
  const task: Task = {
    taskId, status: 'working', ttlMs: 60000, pollIntervalMs: 200,
    createdAt: now, lastUpdatedAt: now, statusMessage: '0/' + count, progress: 0, count,
  };
  await mutate(taskId, () => ({ task, result: undefined }));
  advance(taskId);
  return { resultType: 'task', taskId, status: task.status, ttlMs: task.ttlMs, pollIntervalMs: task.pollIntervalMs };
}

export function getTask(id: string) {
  const records = useMemory() ? undefined : read<Record<string, Task>>('.data/tasks.json', {});
  const stored = records && Object.hasOwn(records, id) ? records[id] : memory.get(id);
  const { taskId, status, statusMessage, ttlMs, pollIntervalMs, createdAt, lastUpdatedAt, result, error } =
    find(stored);
  return complete({ taskId, status, statusMessage, ttlMs, pollIntervalMs, createdAt, lastUpdatedAt, result, error });
}

export async function cancelTask(id: string) {
  await mutate(id, stored => {
    const task = find(stored);
    if (task.status === 'working') task.cancellation = true;
    return { task, result: undefined };
  });
  return complete({});
}
