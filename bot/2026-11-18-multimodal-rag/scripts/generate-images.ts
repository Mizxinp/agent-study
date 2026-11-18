import { loadCatalog } from "../lib/catalog";
import { resolveFontPath, writeSkuImages } from "../lib/generate-image";

const catalog = loadCatalog();
const font = resolveFontPath();
const written = await writeSkuImages(catalog.skus, catalog.glazes, font);
const total = written.reduce((s, x) => s + x.bytes, 0);
console.log(
  JSON.stringify(
    { font, count: written.length, totalBytes: total, files: written },
    null,
    2,
  ),
);
