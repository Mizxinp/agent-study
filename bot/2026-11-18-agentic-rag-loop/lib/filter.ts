import type { Product } from "./data";

export type ProductFilters = {
  skus?: string[];
  series?: string;
  glaze?: string;
  shape?: string;
  minCapacityMl?: number;
  maxCapacityMl?: number;
  minPriceCny?: number;
  maxPriceCny?: number;
  listedAfter?: string;
  listedBefore?: string;
};

const norm = (s: string) => s.replace(/釉$/, "").trim();

/** 纯函数：对结构化属性表做过滤（数值区间为闭区间，日期为 YYYY-MM-DD 字符串比较，含端点）。 */
export function filterProducts(rows: Product[], f: ProductFilters): Product[] {
  return rows.filter(
    (p) =>
      (!f.skus?.length || f.skus.includes(p.sku)) &&
      (!f.series || p.series.includes(f.series.trim())) &&
      (!f.glaze || norm(p.glaze) === norm(f.glaze)) &&
      (!f.shape || p.shape.includes(f.shape.trim())) &&
      (f.minCapacityMl == null || p.capacityMl >= f.minCapacityMl) &&
      (f.maxCapacityMl == null || p.capacityMl <= f.maxCapacityMl) &&
      (f.minPriceCny == null || p.priceCny >= f.minPriceCny) &&
      (f.maxPriceCny == null || p.priceCny <= f.maxPriceCny) &&
      (!f.listedAfter || p.listedAt >= f.listedAfter) &&
      (!f.listedBefore || p.listedAt <= f.listedBefore),
  );
}
