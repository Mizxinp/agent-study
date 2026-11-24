import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { source } from "../lib/frozen";

export function verifyFrozen() {
  for (const file of source.files) {
    const original = readFileSync(new URL(`../../${source.directory.split("/").at(-1)}/${file.path}`, import.meta.url));
    const copy = readFileSync(new URL(`../data/${file.copy}`, import.meta.url));
    const sha256 = createHash("sha256").update(copy).digest("hex");
    const blob = createHash("sha1").update(`blob ${copy.length}\0`).update(copy).digest("hex");
    if (!original.equals(copy) || sha256 !== file.sha256 || blob !== file.blob) {
      throw new Error(`Frozen source mismatch: ${file.path}`);
    }
  }
}

export function withVerifiedFrozen<T>(work: () => T): T {
  verifyFrozen();
  try {
    return work();
  } finally {
    verifyFrozen();
  }
}
