import { mkdir, writeFile } from "node:fs/promises";
import { makeDataset } from "../lib/dataset";
await mkdir(new URL("../data/", import.meta.url), { recursive: true });
for (const d of makeDataset())
  await writeFile(
    new URL(`../data/${d.id}.json`, import.meta.url),
    JSON.stringify(d, null, 2) + "\n",
  );
console.log("Generated 4 deterministic dialogue JSON files (seed 20261115).");
