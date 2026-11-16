import {
  Annotation,
  END,
  InMemoryStore,
  MemorySaver,
  START,
  StateGraph,
  type BaseStore,
} from "@langchain/langgraph";

import {
  factsNamespace,
  lastUserText,
  parseRememberCommand,
  systemMessage,
  userMessage,
} from "./facts";

/**
 * Minimal graph state: a list of conversation lines.
 * Input updates are appended (reducer), not overwritten.
 */
export const DemoState = Annotation.Root({
  messages: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

export type DemoStateType = typeof DemoState.State;
export type DemoContext = {
  userId: string;
};

export type CompiledDemo = {
  graph: ReturnType<typeof buildDemoGraph>;
  checkpointer: MemorySaver;
  store: InMemoryStore;
};

type NodeRuntime = {
  store?: BaseStore;
  configurable?: { userId?: string };
  context?: { userId?: string };
};

function readUserId(runtime: NodeRuntime): string {
  const fromConfigurable = runtime.configurable?.userId;
  const fromContext = runtime.context?.userId;
  const userId =
    (typeof fromConfigurable === "string" && fromConfigurable) ||
    (typeof fromContext === "string" && fromContext) ||
    "";
  if (!userId) {
    throw new Error("userId is required in configurable or context");
  }
  return userId;
}

/**
 * Deterministic turn node:
 * - appends the user line (already in state via the messages reducer)
 * - if the last user text matches 「记住：k=v」, put { text } into Store
 *   at namespace [userId, "facts"] via runtime.store
 * - appends a short system acknowledgement
 * No LLM is called.
 */
async function handleTurn(
  state: DemoStateType,
  runtime: NodeRuntime,
): Promise<{ messages: string[] }> {
  const store = runtime.store;
  if (!store) {
    throw new Error("runtime.store is required; compile the graph with a Store");
  }

  const userId = readUserId(runtime);
  const namespace = factsNamespace(userId);
  const text = lastUserText(state.messages);
  const remembered = parseRememberCommand(text);

  if (remembered) {
    await store.put(namespace, remembered.key, { text: remembered.text });
    return {
      messages: [systemMessage(`已记住 ${remembered.key} = ${remembered.text}`)],
    };
  }

  return {
    messages: [systemMessage(`已记录：${text}`)],
  };
}

function buildDemoGraph(checkpointer: MemorySaver, store: InMemoryStore) {
  return new StateGraph(DemoState)
    .addNode("turn", handleTurn)
    .addEdge(START, "turn")
    .addEdge("turn", END)
    .compile({ checkpointer, store });
}

/** Compile a graph with the given (or fresh) MemorySaver + InMemoryStore. */
export function compileDemoGraph(options?: {
  checkpointer?: MemorySaver;
  store?: InMemoryStore;
}): CompiledDemo {
  const checkpointer = options?.checkpointer ?? new MemorySaver();
  const store = options?.store ?? new InMemoryStore();
  const graph = buildDemoGraph(checkpointer, store);
  return { graph, checkpointer, store };
}

export type RunTurnInput = {
  graph: CompiledDemo["graph"];
  userId: string;
  threadId: string;
  text: string;
};

/** Invoke one user turn against a compiled graph. */
export async function runTurn(input: RunTurnInput): Promise<DemoStateType> {
  const { graph, userId, threadId, text } = input;
  return graph.invoke(
    { messages: [userMessage(text)] },
    {
      configurable: { thread_id: threadId, userId },
      context: { userId },
    },
  );
}

export async function readThreadMessages(
  graph: CompiledDemo["graph"],
  threadId: string,
): Promise<string[]> {
  const snapshot = await graph.getState({
    configurable: { thread_id: threadId },
  });
  const messages = snapshot.values?.messages;
  return Array.isArray(messages) ? messages : [];
}
