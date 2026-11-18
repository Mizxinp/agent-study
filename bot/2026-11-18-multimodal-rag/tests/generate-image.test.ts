import { expect, it } from "vitest";
import { loadCatalog } from "../lib/catalog";
import { cracklePolyline, resolveFontPath, skuSvg, vesselPath } from "../lib/generate-image";

it("合成图 SVG 可复现，含合成标记、型号与容量，开片路径固定", () => {
  const catalog = loadCatalog();
  const font = resolveFontPath();
  const sku = catalog.skus[0];
  const glaze = catalog.glazes.find((g) => g.id === sku.glazeId)!;
  const svg = skuSvg(sku, glaze, font);
  const again = skuSvg(sku, glaze, font);
  expect(svg).toBe(again);
  expect(svg).toContain("合成数据 SYNTHETIC");
  expect(svg).toContain(sku.model);
  expect(svg).toContain(`${sku.capacityMl}ml`);
  expect(vesselPath("meiping")).not.toBe(vesselPath("douli"));
  expect(cracklePolyline().length).toBeGreaterThan(20);
  const crackleSku = catalog.skus.find((s) => s.crackle)!;
  const crackleGlaze = catalog.glazes.find((g) => g.id === crackleSku.glazeId)!;
  expect(skuSvg(crackleSku, crackleGlaze, font)).toContain(cracklePolyline().slice(0, 20));
});
