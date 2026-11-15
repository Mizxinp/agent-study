import { MemoryStore } from "./memory";
// Demo-only process-local state; isolate browsers with a random client id.
const globalState = globalThis as typeof globalThis & {
  chatStores?: Map<
    string,
    { store: MemoryStore; busy: boolean; error?: string }
  >;
};
export const chatStores: Map<
  string,
  { store: MemoryStore; busy: boolean; error?: string }
> = (globalState.chatStores ??= new Map());
export function chatState(id: string, strategy: string) {
  const key = `${id}:${strategy}`;
  if (!chatStores.has(key))
    chatStores.set(key, { store: new MemoryStore(), busy: false });
  return chatStores.get(key)!;
}
