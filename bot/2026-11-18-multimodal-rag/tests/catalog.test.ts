import { expect, it } from "vitest";
import {
  appearanceLeakTerms,
  findAppearanceLeaks,
  loadCatalog,
  loadQuerySet,
} from "../lib/catalog";

it("字幕与短说明不含外观口语，查询集在评测前已冻结且数量达标", () => {
  const catalog = loadCatalog();
  const queries = loadQuerySet();
  expect(catalog.synthetic).toBe(true);
  expect(catalog.skus.length).toBeGreaterThanOrEqual(16);
  for (const sku of catalog.skus) {
    expect(findAppearanceLeaks(sku.caption)).toEqual([]);
    expect(findAppearanceLeaks(sku.description)).toEqual([]);
    expect(sku.caption).toContain(sku.model);
    expect(sku.caption).toContain(`${sku.capacityMl}ml`);
    expect(sku.caption).toContain(`${sku.mouthCm}cm`);
  }
  expect(appearanceLeakTerms.length).toBeGreaterThan(5);
  expect(queries.frozenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(queries.counts.appearance).toBeGreaterThanOrEqual(12);
  expect(queries.counts.attribute).toBeGreaterThanOrEqual(12);
  expect(queries.counts.image).toBeGreaterThanOrEqual(12);
  expect(queries.counts.total).toBeGreaterThanOrEqual(36);
  const ids = new Set(catalog.skus.map((s) => s.id));
  for (const q of queries.queries) {
    for (const id of q.relevant) expect(ids.has(id)).toBe(true);
    if (q.type === "image") {
      expect(q.querySkuId && ids.has(q.querySkuId)).toBe(true);
      expect(q.relevant).not.toContain(q.querySkuId);
    } else {
      expect(q.text && q.text.length).toBeGreaterThan(0);
    }
  }
});
