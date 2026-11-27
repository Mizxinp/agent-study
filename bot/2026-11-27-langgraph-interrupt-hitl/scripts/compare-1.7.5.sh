#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
results_dir="$PWD/results"
comparison_dir="$(mktemp -d "${TMPDIR:-/tmp}/langgraph-hitl-1.7.5.XXXXXX")"
trap 'rm -rf -- "$comparison_dir"' EXIT

cp -R app lib tests package.json pnpm-lock.yaml tsconfig.json styles.d.ts "$comparison_dir/"
cd "$comparison_dir"
node --input-type=module <<'JS'
import { readFileSync, writeFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("package.json", "utf8"));
manifest.dependencies["@langchain/langgraph"] = "1.7.5";
manifest.dependencies["@langchain/langgraph-checkpoint"] = "1.2.3";
manifest.pnpm.overrides["@langchain/langgraph-checkpoint"] = "1.2.3";
writeFileSync("package.json", JSON.stringify(manifest, null, 2) + "\n");
JS
pnpm install --lockfile-only
pnpm install --frozen-lockfile
HITL_RESULTS_DIR="$results_dir" pnpm test
