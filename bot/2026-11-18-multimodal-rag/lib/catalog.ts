import { readFileSync } from "node:fs";
import path from "node:path";
import type { Catalog, Glaze, QuerySet, Sku } from "./types";

export const dataDir = path.resolve(process.cwd(), "data");
export const publicImageDir = path.resolve(process.cwd(), "public/images");
export const dataImageDir = path.resolve(process.cwd(), "data/images");

export function loadCatalog(): Catalog {
  return JSON.parse(readFileSync(path.join(dataDir, "skus.json"), "utf8"));
}

export function loadQuerySet(): QuerySet {
  return JSON.parse(readFileSync(path.join(dataDir, "queries.json"), "utf8"));
}

export function glazeById(catalog: Catalog): Map<string, Glaze> {
  return new Map(catalog.glazes.map((g) => [g.id, g]));
}

export function skuImagePath(sku: Sku): string {
  return path.join(publicImageDir, `${sku.id}.png`);
}

export const appearanceLeakTerms = [
  "粉青",
  "霁红",
  "天青",
  "米色",
  "开片",
  "裂纹",
  "梅瓶",
  "玉壶春",
  "斗笠",
  "天球",
  "釉",
  "器型",
  "梨形",
  "溜肩",
  "浅腹",
  "长颈",
  "圆肚",
  "收口",
  "敞口",
] as const;

export function findAppearanceLeaks(text: string): string[] {
  return appearanceLeakTerms.filter((term) => text.includes(term));
}
