import { InMemoryStore, MemorySaver } from "@langchain/langgraph";

import { compileDemoGraph, type CompiledDemo } from "./graph";

/**
 * Process-level singletons so Next.js Route Handlers reuse the same
 * in-memory Store and Checkpointer across requests (and HMR in dev).
 */
const GLOBAL_KEY = "__langgraphStoreCheckpointerDemo__" as const;

type GlobalDemo = typeof globalThis & {
  [GLOBAL_KEY]?: CompiledDemo;
};

function createBundle(): CompiledDemo {
  return compileDemoGraph({
    checkpointer: new MemorySaver(),
    store: new InMemoryStore(),
  });
}

export function getDemoRuntime(): CompiledDemo {
  const g = globalThis as GlobalDemo;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = createBundle();
  }
  return g[GLOBAL_KEY];
}

export function resetDemoRuntime(): CompiledDemo {
  const g = globalThis as GlobalDemo;
  g[GLOBAL_KEY] = createBundle();
  return g[GLOBAL_KEY];
}

export const DEFAULT_USER_ID = "demo-user";
export const THREAD_A = "thread-a";
export const THREAD_B = "thread-b";
