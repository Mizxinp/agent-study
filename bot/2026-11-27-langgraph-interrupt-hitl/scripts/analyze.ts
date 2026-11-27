import { AssertionError, partialDeepStrictEqual } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";

type Measurements = {
  version: string;
  dependencies: { core: string; checkpoint: string };
  observations: Record<string, unknown>;
};

async function readMeasurements(version: string): Promise<Measurements | undefined> {
  try {
    const data: Measurements = JSON.parse(await readFile(`results/observations-${version}.json`, "utf8"));
    if (data.version !== version) throw new Error(`观测文件版本与 ${version} 不一致`);
    return data;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const baseline = await readMeasurements("1.7.4");
if (!baseline) throw new Error("缺少 1.7.4 观测，请先运行 pnpm test");
const comparison = await readMeasurements("1.7.5");
const validation = { issues: [{ path: ["approved"], code: "invalid_type" }] };
const accepted = { approved: true, note: "" };
const expected = {
  H1: {
    invoke: { name: "GraphValueError", lc_error_code: "MISSING_CHECKPOINTER" },
    resume: { message: "Cannot use Command(resume=...) without checkpointer" },
  },
  H2: {
    initial: { before: 1, after: 0, ledger: 0, pending: 1 },
    resumed: { before: 2, after: 1, ledger: 1, status: "approved" },
  },
  H3: {
    swallowed: { completed: true, caught: "GraphInterrupt", pending: 0 },
    rethrown: { completed: false, caught: "GraphInterrupt", pending: 1 },
  },
  H4: {
    ordered: { prompts: ["name", "amount"], binding: { name: "小林", amount: 100 }, pending: [] },
    swapped: { prompts: ["name", "amount"], binding: { amount: "小林", name: 100 }, pending: [] },
  },
  H5a: { initial: ["left", "right"], binding: { left: "L", right: "R" }, pending: [] },
  H5b: null,
  H5c: {
    initial: ["left", "right"],
    error: { name: "UnknownInterruptError" },
  },
  H6a: {
    schema: { properties: { approved: { type: "boolean" }, note: { default: "" } } },
    invalid: validation, answer: accepted,
  },
  H6b: { schema: { type: "boolean" }, answer: "yes" },
  H7: {
    error: validation, failed: ["check"], afterInvalid: 1, afterRetry: 1,
    binding: { check: accepted, send: 1 },
  },
  H8: { initialPending: 1, right: "accepted" },
  H9: null,
  H10: {
    start: 200,
    publicKeys: ["__interrupt__", "decisionId", "refund"],
    interruptKeys: ["response_schema", "value"],
    ownerMismatch: 403, unknown: 404, statuses: [200, 409], rows: 1, amounts: [100],
    rejection: { http: 200, status: "rejected", rows: 1 },
  },
};

function classify(id: keyof typeof expected, observed: unknown) {
  if (observed === undefined) return "未做";
  if (expected[id] === null) return "记录";
  try {
    partialDeepStrictEqual(observed, expected[id]);
    if (id === "H8") {
      const { wrong } = observed as { wrong: { result?: { answer?: unknown } } };
      if (wrong.result?.answer === "accepted") return "不支持";
    }
    if (id === "H6b") {
      const { schema } = observed as { schema: unknown };
      if (!isDeepStrictEqual(schema, expected.H6b.schema)) return "不支持";
    }
    return "支持";
  } catch (error) {
    if (error instanceof AssertionError) return "不支持";
    throw error;
  }
}

const ids = Object.keys(expected) as (keyof typeof expected)[];
const hypotheses = ids.map((id) => ({
  id,
  conclusion: classify(id, baseline.observations[id]),
  observed: baseline.observations[id],
}));
const differences = comparison ? ids
  .filter((id) => !isDeepStrictEqual(baseline.observations[id], comparison.observations[id]))
  .map((id) => ({
    id,
    baseline: baseline.observations[id],
    comparison: comparison.observations[id],
    conclusion: classify(id, comparison.observations[id]),
  })) : [];
const missing = comparison ? ids.filter((id) => comparison.observations[id] === undefined) : ids;
const h11 = {
  id: "H11",
  conclusion: !comparison ? "未做" : missing.length ? "观测不完整" : differences.length ? "有差异" : "相同",
  version: comparison?.version,
  dependencies: comparison?.dependencies,
  missing,
  differences,
};

await writeFile("results/summary.json", JSON.stringify({
  version: baseline.version, dependencies: baseline.dependencies, hypotheses, h11,
}, null, 2) + "\n");
console.table([
  ...hypotheses.map(({ id, conclusion }) => ({ id, conclusion })),
  { id: h11.id, conclusion: h11.conclusion },
]);
