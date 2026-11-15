import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { makeDataset } from "../lib/dataset";
import { hash, shortIds, type Memory } from "../lib/memory";
import { cosine, bm25 } from "../lib/memory/retrieval";
import { matchAnswer } from "../lib/judging";
describe("deterministic dataset", () => {
  const dataset = makeDataset();
  it("varies sessions and corrected slots and repeats deterministically", () => {
    expect(makeDataset()).toEqual(dataset);
    expect(new Set(dataset.map((d) => d.sessions.length)).size).toBeGreaterThan(
      1,
    );
    expect(
      new Set(
        dataset.map((d) =>
          d.slots
            .filter((s) => s.timeline.length > 1)
            .map((s) => s.name)
            .join(","),
        ),
      ).size,
    ).toBeGreaterThan(1);
  });
  for (const d of dataset)
    it(d.id, () => {
      expect(
        readFileSync(new URL(`../data/${d.id}.json`, import.meta.url), "utf8"),
      ).toBe(JSON.stringify(d, null, 2) + "\n");
      expect(d.seed).toBe(20261115);
      expect(d.sessions.length).toBeGreaterThanOrEqual(3);
      expect(d.sessions.length).toBeLessThanOrEqual(5);
      const messages = d.sessions.flatMap((s) => s.messages);
      expect(messages.length).toBeGreaterThanOrEqual(60);
      expect(messages.length).toBeLessThanOrEqual(120);
      expect(d.slots).toHaveLength(10);
      expect(new Set(d.slots.map((s) => s.name)).size).toBe(10);
      const changed = d.slots.filter((s) => s.timeline.length > 1);
      expect(changed.length).toBeGreaterThanOrEqual(5);
      expect(changed.length).toBeLessThanOrEqual(6);
      for (const slot of d.slots) {
        expect(slot.timeline[0].session).toBe(0);
        expect(slot.timeline.length).toBeLessThanOrEqual(3);
        slot.timeline.forEach((event, i) => {
          expect(event.session).toBeLessThan(d.sessions.length);
          expect(event.aliases).toContain(event.value);
          expect(
            d.sessions[event.session].messages.some(
              (m) =>
                m.role === "user" &&
                m.content.includes(slot.name) &&
                m.content.includes(event.value),
            ),
          ).toBe(true);
          if (i) {
            expect(event.session).toBeGreaterThan(slot.timeline[i - 1].session);
            expect(event.value).not.toBe(slot.timeline[i - 1].value);
          }
        });
      }
      const reverted = changed.filter(
        (s) =>
          s.timeline.length === 3 &&
          s.timeline[0].value === s.timeline[2].value,
      );
      expect(reverted).toHaveLength(1);
      expect(d.distractors).toHaveLength(3);
      for (const distractor of d.distractors) {
        expect(
          d.slots
            .find((s) => s.name === distractor.slot)!
            .timeline.map((t) => t.value),
        ).not.toContain(distractor.value);
        expect(
          messages.filter(
            (m) =>
              m.role === "user" &&
              m.content.includes(distractor.value) &&
              m.content.includes("朋友"),
          ),
        ).toHaveLength(1);
      }
      expect(d.questions).toHaveLength(15);
      expect(new Set(d.questions.map((q) => q.id)).size).toBe(15);
      const current = d.questions.filter((q) => q.type === "current");
      const history = d.questions.filter((q) => q.type === "history");
      const distractorQuestions = d.questions.filter(
        (q) => q.type === "distractor",
      );
      expect(current).toHaveLength(8);
      expect(history).toHaveLength(4);
      expect(distractorQuestions).toHaveLength(3);
      for (const slot of changed)
        expect(current.some((q) => q.text.includes(slot.name))).toBe(true);
      for (const q of current) {
        const slot = d.slots.find((s) => q.text.includes(s.name))!;
        expect(q.gold).toEqual(slot.timeline.at(-1)!.aliases);
        expect(q.old).toEqual(
          [...new Set(slot.timeline.slice(0, -1).map((t) => t.value))].filter(
            (v) => v !== slot.timeline.at(-1)!.value,
          ),
        );
      }
      expect(
        history.some(
          (q) => q.text.includes(reverted[0].name) && q.text.includes("按顺序"),
        ),
      ).toBe(true);
      expect(history.filter((q) => q.text.includes("最初"))).toHaveLength(2);
      expect(history.filter((q) => q.text.includes("按顺序"))).toHaveLength(2);
      for (const q of history) {
        const slot = changed.find((s) => q.text.includes(s.name));
        expect(slot).toBeDefined();
        expect(q.gold).toEqual(
          q.text.includes("最初")
            ? [slot!.timeline[0].value]
            : slot!.timeline.map((t) => t.value),
        );
      }
      distractorQuestions.forEach((q, i) => {
        const distractor = d.distractors[i];
        expect(q.avoid).toEqual([distractor.value]);
        expect(q.gold).toEqual([
          d.slots.find((s) => s.name === distractor.slot)!.timeline.at(-1)!
            .value,
        ]);
      });
    });
});
it("hash dedupe normalizes whitespace and Unicode", () => {
  expect(hash("  Ａ  b ")).toBe(hash("A b"));
  expect(hash("A")).not.toBe(hash("B"));
});
it("short ids round trip opaque ids", () => {
  const m = [{ id: "uuid-x" }, { id: "uuid-z" }] as Memory[];
  expect([...shortIds(m)]).toEqual([
    [1, "uuid-x"],
    [2, "uuid-z"],
  ]);
  expect(shortIds(m).get(3)).toBeUndefined();
});
it("cosine and BM25 ranking", () => {
  expect(cosine([1, 0], [1, 0])).toBe(1);
  expect(cosine([0, 0], [1, 0])).toBe(0);
  expect(cosine([1, 0], [0, 1])).toBe(0);
  const scores = bm25("釉色天青", ["釉色天青", "物流顺丰"]);
  expect(scores[0]).toBeGreaterThan(scores[1]);
});
it("matches current and flags stale, delegates ambiguous distractors", () => {
  const dataset = makeDataset()[0];
  const q = dataset.questions.find(
    (q) => q.type === "current" && q.old.length,
  )!;
  expect(matchAnswer(q, q.gold[0]).correct).toBe(true);
  expect(matchAnswer(q, q.old[0]).stale).toBe(true);
  expect(matchAnswer(q, "不知道").correct).toBe(false);
  const distractor = dataset.questions.find((q) => q.type === "distractor")!;
  expect(matchAnswer(distractor, distractor.avoid[0]).correct).toBeUndefined();
});
