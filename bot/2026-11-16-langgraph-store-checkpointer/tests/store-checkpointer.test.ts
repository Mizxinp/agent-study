import { InMemoryStore, MemorySaver } from "@langchain/langgraph";
import { describe, expect, it } from "vitest";

import { factsNamespace } from "@/lib/facts";
import {
  compileDemoGraph,
  readThreadMessages,
  runTurn,
} from "@/lib/graph";

const EMBEDDING_KEY_VARS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_API_KEY",
] as const;

function hasEmbeddingKey(): boolean {
  return EMBEDDING_KEY_VARS.some((name) => Boolean(process.env[name]));
}

async function waitUntilAfter(previous: Date): Promise<void> {
  while (Date.now() <= previous.getTime()) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("H1: Checkpointer isolates thread state; Store is shared across threads", () => {
  it("H1: thread B cannot read thread A's messages but can get/search the Store fact written in A", async () => {
    const { graph, store } = compileDemoGraph({
      checkpointer: new MemorySaver(),
      store: new InMemoryStore(),
    });
    const userId = "user-h1";
    const threadA = "thread-a-h1";
    const threadB = "thread-b-h1";

    await runTurn({
      graph,
      userId,
      threadId: threadA,
      text: "记住：favorite_food=pizza",
    });
    await runTurn({
      graph,
      userId,
      threadId: threadA,
      text: "你好，这是线程 A 的对话。",
    });

    const stateA = await readThreadMessages(graph, threadA);
    expect(stateA.some((line) => line.includes("这是线程 A 的对话"))).toBe(true);
    expect(stateA.some((line) => line.includes("已记住 favorite_food = pizza"))).toBe(
      true,
    );

    // Thread B has never been invoked: its checkpoint state must not include A's lines.
    const stateBBefore = await readThreadMessages(graph, threadB);
    expect(stateBBefore).toEqual([]);
    expect(stateBBefore.some((line) => line.includes("线程 A"))).toBe(false);

    await runTurn({
      graph,
      userId,
      threadId: threadB,
      text: "你好，这是线程 B。",
    });

    const stateB = await readThreadMessages(graph, threadB);
    expect(stateB.some((line) => line.includes("这是线程 B"))).toBe(true);
    expect(stateB.some((line) => line.includes("线程 A"))).toBe(false);
    expect(stateB.some((line) => line.includes("favorite_food"))).toBe(false);

    // A's conversation is unchanged after B talks.
    const stateAAfter = await readThreadMessages(graph, threadA);
    expect(stateAAfter).toEqual(stateA);

    const namespace = factsNamespace(userId);
    const got = await store.get(namespace, "favorite_food");
    expect(got).not.toBeNull();
    expect(got?.key).toBe("favorite_food");
    expect(got?.value).toEqual({ text: "pizza" });
    expect(got?.namespace).toEqual(namespace);

    const found = await store.search(namespace, { limit: 100 });
    expect(found.map((item) => item.key)).toContain("favorite_food");
    expect(found).toHaveLength(1);
    expect(found[0]?.value).toEqual({ text: "pizza" });
  });
});

describe("H2: put() overwrites value, preserves createdAt, updates updatedAt", () => {
  it("H2: two puts to the same (namespace, key) keep createdAt and refresh updatedAt", async () => {
    const store = new InMemoryStore();
    const namespace = ["h2", "facts"];

    await store.put(namespace, "color", { text: "blue" });
    const first = await store.get(namespace, "color");
    expect(first).not.toBeNull();
    expect(first?.value).toEqual({ text: "blue" });
    expect(first?.createdAt).toBeInstanceOf(Date);
    expect(first?.updatedAt).toBeInstanceOf(Date);

    const createdAt = first!.createdAt;
    const firstUpdatedAt = first!.updatedAt;
    await waitUntilAfter(firstUpdatedAt);

    await store.put(namespace, "color", { text: "green" });
    const second = await store.get(namespace, "color");
    expect(second).not.toBeNull();
    expect(second?.value).toEqual({ text: "green" });
    expect(second?.createdAt).toBeInstanceOf(Date);
    expect(second?.updatedAt).toBeInstanceOf(Date);

    // createdAt is preserved (same timestamp as the first put).
    expect(second!.createdAt.getTime()).toBe(createdAt.getTime());
    // updatedAt moves forward.
    expect(second!.updatedAt.getTime()).toBeGreaterThan(firstUpdatedAt.getTime());
    expect(second!.updatedAt.getTime()).toBeGreaterThan(second!.createdAt.getTime());
  });
});

describe("H3: namespace search matches by path segments, not string prefix", () => {
  it('H3: search(["tenant","acme"]) returns acme and acme/child, not acme-corp', async () => {
    const store = new InMemoryStore();

    await store.put(["tenant", "acme"], "root-fact", { text: "acme-root" });
    await store.put(["tenant", "acme", "child"], "child-fact", {
      text: "acme-child",
    });
    await store.put(["tenant", "acme-corp"], "corp-fact", { text: "acme-corp" });

    const results = await store.search(["tenant", "acme"], { limit: 100 });
    const keys = results.map((item) => item.key).sort();
    const namespaces = results.map((item) => item.namespace);

    expect(keys).toEqual(["child-fact", "root-fact"]);
    expect(namespaces).toEqual(
      expect.arrayContaining([
        ["tenant", "acme"],
        ["tenant", "acme", "child"],
      ]),
    );
    expect(results.some((item) => item.key === "corp-fact")).toBe(false);
    expect(
      results.some((item) => item.namespace.join("/") === "tenant/acme-corp"),
    ).toBe(false);
    expect(results).toHaveLength(2);

    // Control: the hyphenated sibling is stored and reachable under its own prefix.
    const corp = await store.get(["tenant", "acme-corp"], "corp-fact");
    expect(corp?.value).toEqual({ text: "acme-corp" });
  });
});

describe("H4: compiling with MemorySaver requires thread_id on invoke", () => {
  it("H4: invoke without a thread_id throws, and the error mentions thread_id", async () => {
    const { graph } = compileDemoGraph({
      checkpointer: new MemorySaver(),
      store: new InMemoryStore(),
    });

    const input = { messages: ["用户：hello"] };

    // The demo node requires userId. Pass userId but omit thread_id so the
    // thrown error comes from MemorySaver (checkpoint persistence), not from
    // the node. Official 1.7.4 message: "Failed to put checkpoint ... thread_id".
    await expect(
      graph.invoke(input, {
        configurable: { userId: "user-h4" },
        context: { userId: "user-h4" },
      }),
    ).rejects.toThrow(/thread_id/);

    await expect(
      graph.invoke(input, { configurable: { userId: "user-h4" } }),
    ).rejects.toThrow(/thread_id/);
  });
});

describe("H5: optional InMemoryStore semantic index (skipped without embedding keys)", () => {
  it.skipIf(!hasEmbeddingKey())(
    "H5: updating the same key lowers the old-text query score and raises the new-text score",
    () => {
      // Intentionally not implemented here: this environment has no embedding
      // key at authoring time, and scores must not be mocked.
      throw new Error(
        "H5 should only run when an embedding key is configured; do not mock scores.",
      );
    },
  );

  it("H5: records a skip when no embedding API key is set", () => {
    if (!hasEmbeddingKey()) {
      expect(hasEmbeddingKey()).toBe(false);
      return;
    }
    // If a key appears later, the skipIf test above is the intended runner.
    expect(hasEmbeddingKey()).toBe(true);
  });
});
