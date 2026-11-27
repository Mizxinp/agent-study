import {
  Annotation, Command, END, interrupt, INTERRUPT, isGraphInterrupt,
  isInterrupted, MemorySaver, START, StateGraph,
} from "@langchain/langgraph";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, expect, test, vi } from "vitest";
import { POST as approve } from "../app/api/approve/route";
import { POST as chat } from "../app/api/chat/route";
import { approval, refundGraph } from "../lib/refund";

const require = createRequire(import.meta.url);
const graphPackage = require.resolve("@langchain/langgraph/package.json");
const graphRequire = createRequire(graphPackage);
const version: string = require(graphPackage).version;
const dependencies = {
  core: graphRequire("@langchain/core/package.json").version,
  checkpoint: graphRequire("@langchain/langgraph-checkpoint/package.json").version,
};
const observations: Record<string, unknown> = {};
const directories: string[] = [];
const thread = () => ({ configurable: { thread_id: randomUUID() } });
const State = Annotation.Root({ answer: Annotation<unknown>() });

function linear(node: () => { answer: unknown }, checkpointer = true) {
  return new StateGraph(State)
    .addNode("ask", node)
    .addEdge(START, "ask")
    .addEdge("ask", END)
    .compile(checkpointer ? { checkpointer: new MemorySaver() } : {});
}

function pending(result: unknown) {
  return isInterrupted(result) ? result[INTERRUPT] : [];
}

function ids(result: unknown) {
  return Object.fromEntries(pending(result).map(({ id, value }) => [String(value), id ?? ""]));
}

async function attempt<T>(invoke: () => Promise<T>) {
  try {
    return { result: await invoke() };
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    const { name, message, lc_error_code, issues } = error as Error & {
      lc_error_code?: string;
      issues?: { path: string[]; code: string }[];
    };
    return { error: { name, message, lc_error_code, issues } };
  }
}

async function dataDir() {
  const dir = await mkdtemp(join(tmpdir(), "refund-hitl-"));
  directories.push(dir);
  return dir;
}

async function ledger(dir: string) {
  try {
    const data = await readFile(join(dir, "ledger.jsonl"), "utf8");
    return data.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return [];
  }
}

afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await Promise.all(directories.map((dir) => rm(dir, { recursive: true })));
  const dir = process.env.HITL_RESULTS_DIR ?? "results";
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `observations-${version}.json`), JSON.stringify({ version, dependencies, observations }, null, 2) + "\n");
});

test("H1 无 checkpointer", async () => {
  const graph = linear(() => ({ answer: interrupt("question") }), false);
  const invoke = await attempt(() => graph.invoke({ answer: null }, thread()));
  const resume = await attempt(() => graph.invoke(new Command({ resume: true }), thread()));
  observations.H1 = { invoke: invoke.error, resume: resume.error };
  expect(invoke.error).toMatchObject({ name: "GraphValueError", lc_error_code: "MISSING_CHECKPOINTER" });
  expect(resume.error?.message).toContain("Cannot use Command(resume=...) without checkpointer");
});

test("H2 节点重跑和记账", async () => {
  const dir = await dataDir();
  const counts = { before: 0, after: 0 };
  const graph = refundGraph(dir, counts);
  const config = thread();
  const paused = await graph.invoke({ refund: { order: "H2", amount: 100 }, decisionId: "H2" }, config);
  const initial = { ...counts, ledger: (await ledger(dir)).length, pending: pending(paused).length };
  const result = await graph.invoke(new Command({ resume: { approved: true } }), config);
  const resumed = { ...counts, ledger: (await ledger(dir)).length, status: result.status };
  observations.H2 = { initial, resumed };
  expect(initial).toEqual({ before: 1, after: 0, ledger: 0, pending: 1 });
  expect(resumed).toEqual({ before: 2, after: 1, ledger: 1, status: "approved" });
});

test("H3 捕获和继续抛出", async () => {
  async function run(rethrow: boolean) {
    let completed = false;
    let caught = "";
    const graph = linear(() => {
      try {
        interrupt("question");
      } catch (error) {
        caught = error instanceof Error ? error.name : typeof error;
        if (rethrow && isGraphInterrupt(error)) throw error;
      }
      completed = true;
      return { answer: null };
    });
    const result = await graph.invoke({ answer: null }, thread());
    return { completed, caught, pending: pending(result).length };
  }
  observations.H3 = { swallowed: await run(false), rethrown: await run(true) };
});

test("H4 同节点交换 interrupt 顺序", async () => {
  async function run(swap: boolean) {
    let first = "name";
    let second = "amount";
    const graph = linear(() => {
      const firstAnswer: unknown = interrupt(first);
      const secondAnswer: unknown = interrupt(second);
      return { answer: { [first]: firstAnswer, [second]: secondAnswer } };
    });
    const config = thread();
    const initial = await graph.invoke({ answer: null }, config);
    const middle = await graph.invoke(new Command({ resume: "小林" }), config);
    if (swap) [first, second] = [second, first];
    const final = await graph.invoke(new Command({ resume: 100 }), config);
    return {
      prompts: [...pending(initial), ...pending(middle)].map((item) => item.value),
      binding: final.answer,
      pending: pending(final).map((item) => item.value),
    };
  }
  observations.H4 = { ordered: await run(false), swapped: await run(true) };
});

const ParallelState = Annotation.Root({
  bindings: Annotation<Record<string, unknown>>({
    reducer: (left, right) => ({ ...left, ...right }),
    default: () => ({}),
  }),
});

function parallel<A extends string, B extends string>(
  left: () => unknown,
  right: () => unknown | Promise<unknown>,
  names: { left: A; right: B },
) {
  return new StateGraph(ParallelState)
    .addNode(names.left, () => ({ bindings: { [names.left]: left() } }))
    .addNode(names.right, async () => ({ bindings: { [names.right]: await right() } }))
    .addEdge(START, names.left)
    .addEdge(START, names.right)
    .compile({ checkpointer: new MemorySaver() });
}

test.each(["H5a", "H5b", "H5c"] as const)("%s 并行恢复", async (id) => {
  const graph = parallel(() => interrupt("left"), () => interrupt("right"), { left: "left", right: "right" });
  const config = id === "H5c"
    ? { configurable: { ...thread().configurable, __pregel_strict_resume: true } }
    : thread();
  const initial = await graph.invoke({ bindings: {} }, config);
  const keys = ids(initial);
  const resume = id === "H5a" ? { [keys.left]: "L", [keys.right]: "R" } : "single";
  const { result, error } = await attempt(() => graph.invoke(new Command({ resume }), config));
  const remaining = (await graph.getState(config)).tasks.flatMap((task) => task.interrupts);
  observations[id] = {
    initial: Object.keys(keys).sort(),
    binding: result?.bindings,
    pending: remaining.map((item) => item.value).sort(),
    error,
  };
  if (id === "H5a") {
    expect(Object.keys(keys).sort()).toEqual(["left", "right"]);
    expect(result?.bindings).toEqual({ left: "L", right: "R" });
    expect(pending(result)).toHaveLength(0);
  }
});

test("H6a Zod 非法值与同线程重试", async () => {
  const graph = linear(() => ({ answer: interrupt("approved?", { responseSchema: approval }) }));
  const config = thread();
  const initial = await graph.invoke({ answer: null }, config);
  const invalid = await attempt(() => graph.invoke(new Command({ resume: { approved: "yes" } }), config));
  const result = await graph.invoke(new Command({ resume: { approved: true } }), config);
  observations.H6a = { schema: pending(initial)[0]?.response_schema, invalid: invalid.error, answer: result.answer };
  expect(invalid.error?.issues).toMatchObject([{ code: "invalid_type", path: ["approved"] }]);
  expect(result.answer).toEqual({ approved: true, note: "" });
});

test("H6b JSON Schema 与不合规答案", async () => {
  const schema = { type: "boolean" } as const;
  const graph = linear(() => ({ answer: interrupt("approved?", { responseSchema: schema }) }));
  const config = thread();
  const initial = await graph.invoke({ answer: null }, config);
  const { error, result } = await attempt(() => graph.invoke(new Command({ resume: "yes" }), config));
  observations.H6b = { expectedSchema: schema, schema: pending(initial)[0]?.response_schema, answer: result?.answer, error };
});

test("H7 校验失败时兄弟任务完成", async () => {
  let sent = 0;
  const graph = parallel(
    () => interrupt("check", { responseSchema: approval }),
    async () => {
      interrupt("send", { responseSchema: approval });
      sent += 1;
      await new Promise((resolve) => setTimeout(resolve, 25));
      return sent;
    },
    { left: "check", right: "send" },
  );
  const config = thread();
  const initial = await graph.invoke({ bindings: {} }, config);
  const keys = ids(initial);
  const good = { approved: true };
  const invalid = await attempt(() => graph.invoke(new Command({
    resume: { [keys.check]: { approved: "yes" }, [keys.send]: good },
  }), config));
  const afterInvalid = sent;
  const failed = (await graph.getState(config)).tasks.filter((task) => task.error !== undefined).map((task) => task.name);
  const result = await graph.invoke(new Command({ resume: { [keys.check]: good } }), config);
  observations.H7 = { error: invalid.error, failed, afterInvalid, afterRetry: sent, binding: result.bindings };
  expect(invalid.error?.issues).toMatchObject([{ code: "invalid_type", path: ["approved"] }]);
  expect(failed).toEqual(["check"]);
  expect([afterInvalid, sent]).toEqual([1, 1]);
  expect(result.bindings).toEqual({ check: { approved: true, note: "" }, send: 1 });
});

test("H8 线程隔离", async () => {
  const graph = linear(() => ({ answer: interrupt("question") }));
  const config = thread();
  const initial = await graph.invoke({ answer: null }, config);
  const wrong = await attempt(() => graph.invoke(new Command({ resume: "accepted" }), thread()));
  const right = await graph.invoke(new Command({ resume: "accepted" }), config);
  observations.H8 = { initialPending: pending(initial).length, wrong, right: right.answer };
  expect(pending(initial)).toHaveLength(1);
  expect(wrong.result?.answer).not.toBe("accepted");
  expect(right.answer).toBe("accepted");
});

function request(body: object, owner = "manager") {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-demo-user": owner },
    body: JSON.stringify(body),
  });
}

test("H10 Route Handler 身份、恢复材料与并发消费，H9 重复提交", async () => {
  const dir = await dataDir();
  vi.stubEnv("REFUND_DATA_DIR", dir);
  const response = await chat(request({ order: "H10", amount: 100 }));
  const publicState = await response.json();
  const submit = { decisionId: publicState.decisionId, approved: true };
  const ownerMismatch = await approve(request(submit, "other"));
  const unknown = await approve(request({ ...submit, decisionId: randomUUID() }));
  const withExtras = { ...submit, thread_id: "unused", resume: { approved: true, amount: 9999 } };
  const responses = await Promise.all([approve(request(withExtras)), approve(request(withExtras))]);
  const statuses = responses.map((item) => item.status).sort();
  const rows = await ledger(dir);
  const replay = await approve(request(withExtras));
  observations.H9 = {
    before: rows.length, after: (await ledger(dir)).length, status: replay.status, body: await replay.json(),
  };

  const rejectedStart = await (await chat(request({ order: "reject", amount: 200 }))).json();
  const rejected = await approve(request({ decisionId: rejectedStart.decisionId, approved: false }));
  const rejectedBody = await rejected.json();
  observations.H10 = {
    start: response.status,
    publicKeys: Object.keys(publicState).sort(),
    interruptKeys: Object.keys(publicState.__interrupt__[0]).sort(),
    ownerMismatch: ownerMismatch.status,
    unknown: unknown.status,
    statuses,
    rows: rows.length,
    amounts: rows.map((row) => row.amount),
    rejection: { http: rejected.status, status: rejectedBody.status, rows: (await ledger(dir)).length },
  };
  expect(response.status).toBe(200);
  expect(Object.keys(publicState).sort()).toEqual(["__interrupt__", "decisionId", "refund"]);
  expect(Object.keys(publicState.__interrupt__[0]).sort()).toEqual(["response_schema", "value"]);
  expect(publicState.__interrupt__[0].value).toEqual({ question: "店长是否批准这笔退款？", order: "H10", amount: 100 });
  expect([ownerMismatch.status, unknown.status]).toEqual([403, 404]);
  expect(statuses).toEqual([200, 409]);
  expect(rows).toEqual([{ ...publicState.refund, decisionId: publicState.decisionId, note: "" }]);
  expect([rejected.status, rejectedBody.status, (await ledger(dir)).length]).toEqual([200, "rejected", 1]);
});
