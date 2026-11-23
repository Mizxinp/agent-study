import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, expect, test } from "vitest";
import { evaluate } from "../lib/evaluation";
import { frozenQuestions, onlineTrace, rows } from "../lib/frozen";
import { hasSearchResult, rules } from "../lib/online";
import { normalizeInput, promote, serializePromotion } from "../lib/promotion";
import { verifyFrozen } from "../scripts/verify-frozen";

beforeAll(verifyFrozen);
afterAll(verifyFrozen);

test("H1 receives a reference-free projection and is invariant to offline labels", () => {
  for (const row of rows) {
    const input = onlineTrace(row);
    expect(Object.keys(input)).toEqual(["answer", "steps"]);
    const changed = { ...row, gold: ["unrelated"], correct: !row.correct, f1: -1 };
    for (const rule of Object.values(rules)) {
      expect(rule(onlineTrace(changed))).toBe(rule(input));
    }
  }
  if (false) {
    // @ts-expect-error A frozen row must be projected before online scoring.
    rules.skuSet(rows[0]);
  }
});

test("SKU shape allows the empty set and rejects missing or duplicate answers", () => {
  expect(rules.skuSet({ answer: [], steps: [] })).toBe(true);
  expect(rules.skuSet({ answer: null, steps: [] })).toBe(false);
  expect(rules.skuSet({ answer: ["DH-TC-0915", "DH-TC-0915"], steps: [] })).toBe(false);
  expect(rules.skuSet({ answer: ["wrong"], steps: [] })).toBe(false);
});

test("H1 counts both disagreement directions within each pipeline", () => {
  expect(evaluate(rows).h1).toEqual([
    { pipeline: "fixed", rule: "skuSet", n: 120, pass: 120, goldPass: 92, passGoldFail: 28, failGoldPass: 0 },
    { pipeline: "fixed", rule: "noToolError", n: 120, pass: 120, goldPass: 92, passGoldFail: 28, failGoldPass: 0 },
    { pipeline: "agentic", rule: "skuSet", n: 120, pass: 116, goldPass: 116, passGoldFail: 0, failGoldPass: 0 },
    { pipeline: "agentic", rule: "noToolError", n: 120, pass: 118, goldPass: 116, passGoldFail: 2, failGoldPass: 0 },
  ]);
});

test("H2 requires a result and both rates use the same eligible rows", () => {
  expect(evaluate(rows).h2).toEqual({ n: 120, localPass: 120, goldPass: 116 });
  const row = rows.find((row) => row.pipeline === "agentic" && row.correct)!;
  const [first, ...remaining] = row.steps;
  const missing = { ...first, toolResults: [] };
  expect(hasSearchResult(missing)).toBe(false);
  expect(hasSearchResult({
    ...first, toolResults: [{ toolName: "search", summary: "error", error: true }],
  })).toBe(false);
  expect(evaluate([
    { ...row, steps: [missing, ...remaining] },
    { ...row, steps: [{ ...first, toolCalls: [] }, ...remaining] },
    { ...row, pipeline: "fixed" },
  ]).h2).toEqual({ n: 1, localPass: 0, goldPass: 1 });
});

test("H3 bytes survive reordering and match the checked-in fixture and hash", () => {
  const first = serializePromotion(rows, frozenQuestions);
  expect(serializePromotion(rows.toReversed(), frozenQuestions.toReversed())).toBe(first);
  expect(readFileSync(new URL("../data/regression.json", import.meta.url), "utf8")).toBe(first);
  const manifest = readFileSync(new URL("../data/regression.sha256", import.meta.url), "utf8");
  expect(createHash("sha256").update(first).digest("hex") + "  regression.json\n").toBe(manifest);
  const { cases } = promote(rows, frozenQuestions);
  expect(cases).toHaveLength(13);
  expect(cases.flatMap(({ traces }) => traces)).toHaveLength(32);
  expect(cases.map((item) => item.normalizedInput)).toEqual(
    [...new Set(cases.map(({ input }) => normalizeInput(input)))].sort(),
  );
});

test("H3 deduplicates equivalent prompts across qids and retains either kind of failure", () => {
  const bad = rows.find((row) => !row.correct && row.answer !== null)!;
  const heuristicOnly = { ...bad, qid: "alternate", answer: null, correct: true };
  const { cases } = promote([bad, heuristicOnly], [
    { id: bad.qid, question: "  ＳＫＵ　 test  " },
    { id: "alternate", question: "SKU test" },
  ]);
  expect(cases).toHaveLength(1);
  expect(cases[0].normalizedInput).toBe("SKU test");
  expect(cases[0].traces).toHaveLength(2);
  expect(cases[0].traces.find((trace) => trace.qid === "alternate")?.observed)
    .toMatchObject({ failedRules: ["skuSet"], exactMatchFailed: false });
});
