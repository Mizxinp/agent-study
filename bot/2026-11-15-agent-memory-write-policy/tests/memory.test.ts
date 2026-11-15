import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ extract: vi.fn(), decide: vi.fn() }));
vi.mock("../lib/providers", () => ({
  providers: () => ({ answer: {}, embedding: undefined }),
}));
vi.mock("ai", async (original) => ({
  ...(await original<typeof import("ai")>()),
  generateObject: mocks.extract,
  generateText: mocks.decide,
}));
import { MemoryStore, hash } from "../lib/memory";
beforeEach(() => vi.clearAllMocks());
it("add-only extracts once per session and dedupes repeated content", async () => {
  mocks.extract.mockResolvedValue({
    object: { facts: ["发货城市：泉州", "发货城市：泉州"] },
  });
  const s = new MemoryStore();
  const r = await s.write("add-only", "transcript", "2026-11-01T00:00:00Z");
  expect(mocks.extract).toHaveBeenCalledTimes(1);
  expect(r.llmCalls).toBe(1);
  expect(r.events.map((e) => e.action)).toEqual(["ADD", "NOOP"]);
  expect(s.memories).toHaveLength(1);
  expect(s.memories[0].created_at).toBe("2026-11-01T00:00:00Z");
});
it("CRUD maps tool short ids back for update and delete", async () => {
  const s = new MemoryStore();
  s.memories = [
    {
      id: "opaque-uuid",
      content: "发货城市：泉州",
      hash: hash("发货城市：泉州"),
      created_at: "old",
    },
  ];
  mocks.extract.mockResolvedValue({ object: { facts: ["发货城市：厦门"] } });
  mocks.decide.mockResolvedValueOnce({
    toolCalls: [
      {
        toolName: "decide",
        input: { action: "UPDATE", id: 1, content: "发货城市：厦门" },
      },
    ],
  });
  await s.write("crud", "correction", "new");
  expect(s.memories).toHaveLength(1);
  expect(s.memories[0]).toMatchObject({
    id: "opaque-uuid",
    content: "发货城市：厦门",
    created_at: "new",
  });
  const sent = JSON.parse(mocks.decide.mock.calls[0][0].prompt);
  expect(sent.existing).toEqual([{ id: 1, content: "发货城市：泉州" }]);
  mocks.extract.mockResolvedValue({ object: { facts: ["取消发货城市"] } });
  mocks.decide.mockResolvedValueOnce({
    toolCalls: [
      { toolName: "decide", input: { action: "DELETE", id: 1, content: "" } },
    ],
  });
  await s.write("crud", "cancel", "later");
  expect(s.memories).toHaveLength(0);
});
it("rejects hallucinated tool ids", async () => {
  mocks.extract.mockResolvedValue({ object: { facts: ["new"] } });
  mocks.decide.mockResolvedValue({
    toolCalls: [
      {
        toolName: "decide",
        input: { action: "UPDATE", id: 99, content: "new" },
      },
    ],
  });
  await expect(new MemoryStore().write("crud", "x", "date")).rejects.toThrow(
    "invalid short id",
  );
});
