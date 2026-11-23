import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Pipeline, Row, Slice } from "./statistics";

export const provenance = {
  base: "37bc3eefe3536fe2cb70b94ff1ee5dd3eab481b7",
  introduced: "f6f5d160777acc6cf77034b845105fdf3eb068ad",
  introducedAt: "2026-11-21 09:04:48 +0800",
  blob: "fd761b71959e7bfdf7f5728c9d074aca3b7abed0",
  sha256: "067821e5a441e8a9f15292faf06c9d5e2a38b30ad145400b927a5f89a530aa5f",
  source: "bot/2026-11-18-agentic-rag-loop/results.json",
};

type FrozenResults = {
  rows: Row[];
  summary: Record<Slice, Record<Pipeline, { n: number; accuracy: number }>>;
  paired: Record<Slice, {
    agenticWins: number;
    fixedWins: number;
    ties: number;
    signTestP: number;
  }>;
};

function git(...args: string[]) {
  return execFileSync("git", args, {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    encoding: "utf8",
  }).trim();
}

export function readVerifiedResults() {
  for (const commit of [provenance.base, provenance.introduced]) {
    if (git("rev-parse", `${commit}:${provenance.source}`) !== provenance.blob) {
      throw new Error(`冻结数据 Git 对象不符：${commit}`);
    }
  }
  if (
    git("show", "-s", "--format=%ai", provenance.introduced) !== provenance.introducedAt ||
    git("diff-tree", "--no-commit-id", "--name-only", "--diff-filter=A", "-r",
      provenance.introduced, "--", `:(top)${provenance.source}`) !== provenance.source
  ) {
    throw new Error("冻结数据首次纳入提交不符");
  }

  const source = readFileSync(new URL(`../../../${provenance.source}`, import.meta.url));
  const copy = readFileSync(new URL("../data/results.json", import.meta.url));
  for (const [label, bytes] of [["源文件", source], ["副本", copy]] as const) {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const blob = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    if (sha256 !== provenance.sha256 || blob !== provenance.blob) {
      throw new Error(`${label}的 SHA-256 或 Git blob 不符，停止分析`);
    }
  }
  if (!source.equals(copy)) throw new Error("冻结副本与源文件字节不同");
  return JSON.parse(copy.toString("utf8")) as FrozenResults;
}
