export const VERSION = '2026-07-28';
export const TASKS = 'io.modelcontextprotocol/tasks';
export const EVENTS = 'io.modelcontextprotocol/events';
export const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
export const CAPS_KEY = 'io.modelcontextprotocol/clientCapabilities';

export class RpcError extends Error {
  constructor(public code: number, message: string, public data?: object, public status = 200) {
    super(message);
  }
}

export function complete<T extends object>(data: T) {
  return { resultType: 'complete' as const, ...data };
}

export function tool(data: object, isError = false) {
  return complete({ content: [{ type: 'text', text: JSON.stringify(data) }], isError });
}

export function stringParam(value: unknown) {
  if (typeof value !== 'string' || !value) throw new RpcError(-32602, 'Expected nonempty string');
  return value;
}
