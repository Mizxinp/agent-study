import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { dataImageDir, publicImageDir } from "./catalog";
import type { Glaze, Sku } from "./types";

export const IMAGE_SIZE = 512;
export const FONT_CANDIDATES = [
  process.env.FONT_PATH,
  "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
  "/home/box/.fonts/NotoSansSC-Bold.otf",
  "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
].filter((x): x is string => Boolean(x));

export function resolveFontPath(): string {
  for (const candidate of FONT_CANDIDATES) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {}
  }
  throw new Error(
    `No CJK font found. Set FONT_PATH or install one of: ${FONT_CANDIDATES.join(", ")}`,
  );
}

function shade(hex: string, amount: number): string {
  const n = hex.replace("#", "");
  const r = Math.max(0, Math.min(255, parseInt(n.slice(0, 2), 16) + amount));
  const g = Math.max(0, Math.min(255, parseInt(n.slice(2, 4), 16) + amount));
  const b = Math.max(0, Math.min(255, parseInt(n.slice(4, 6), 16) + amount));
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Closed vessel silhouette in a 512×512 viewBox. Distinctive, deterministic paths. */
export function vesselPath(shapeId: string): string {
  switch (shapeId) {
    case "meiping":
      // 梅瓶：小口、短颈、丰肩、瘦足
      return "M236 70 L276 70 C286 88 288 108 274 128 C350 158 378 188 378 228 C378 278 348 338 312 392 C300 414 298 428 312 448 L200 448 C214 428 212 414 200 392 C164 338 134 278 134 228 C134 188 162 158 238 128 C224 108 226 88 236 70 Z";
    case "yuhuchun":
      // 玉壶春：侈口、细颈、梨形腹
      return "M200 60 C215 60 230 72 236 100 C242 130 244 160 242 190 C220 230 150 270 150 330 C150 380 180 430 200 448 L312 448 C332 430 362 380 362 330 C362 270 292 230 270 190 C268 160 270 130 276 100 C282 72 297 60 312 60 Z";
    case "tianqiu":
      // 天球瓶：长颈、球形腹
      return "M238 48 L274 48 L272 196 C348 208 404 274 404 348 C404 430 338 472 256 472 C174 472 108 430 108 348 C108 274 164 208 240 196 L238 48 Z";
    case "douli":
      // 斗笠盏：宽口、斜腹、小圈足
      return "M36 196 L476 196 L320 404 C292 436 220 436 192 404 L36 196 Z";
    default:
      throw new Error(`unknown shape: ${shapeId}`);
  }
}

/** Fixed crackle network (no randomness). Same pattern for every open-piece glaze. */
export function cracklePolyline(): string {
  return [
    "M80 120 L200 160 L260 80 L340 140 L430 110",
    "M140 70 L180 200 L120 300 L210 360 L160 430",
    "M240 60 L250 180 L310 250 L240 330 L300 420",
    "M360 90 L330 200 L400 280 L350 360 L420 430",
    "M100 240 L200 260 L280 220 L360 300 L450 260",
    "M70 340 L160 320 L250 380 L340 340 L430 390",
    "M210 140 L300 170 L380 150",
    "M180 400 L260 360 L340 410",
  ].join(" ");
}

export function skuSvg(sku: Sku, glaze: Glaze, fontPath: string): string {
  const fill = glaze.color;
  const light = shade(fill, 42);
  const dark = shade(fill, -36);
  const path = vesselPath(sku.shapeId);
  const fontUri = pathToFileUrl(fontPath);
  const caption = `${sku.model}  ${sku.capacityMl}ml  口径${sku.mouthCm}cm`;
  const crackle = glaze.crackle
    ? `<g clip-path="url(#vessel)">
        <path d="${cracklePolyline()}" fill="none" stroke="${shade(fill, -80)}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="0.72" />
      </g>`
    : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${IMAGE_SIZE}" height="${IMAGE_SIZE}" viewBox="0 0 ${IMAGE_SIZE} ${IMAGE_SIZE}">
  <defs>
    <style><![CDATA[
      @font-face { font-family: "SkuFont"; src: url("${fontUri}"); }
      .label { font-family: "SkuFont", "Droid Sans Fallback", sans-serif; }
    ]]></style>
    <linearGradient id="glaze" x1="30%" y1="10%" x2="80%" y2="90%">
      <stop offset="0%" stop-color="${light}" />
      <stop offset="45%" stop-color="${fill}" />
      <stop offset="100%" stop-color="${dark}" />
    </linearGradient>
    <clipPath id="vessel"><path d="${path}" /></clipPath>
  </defs>
  <rect width="512" height="512" fill="#F3EBDA" />
  <text x="16" y="28" class="label" font-size="16" fill="#8A7A62">合成数据 SYNTHETIC</text>
  <ellipse cx="256" cy="452" rx="150" ry="16" fill="#D9CDB6" />
  <path d="${path}" fill="url(#glaze)" stroke="${dark}" stroke-width="2" />
  ${crackle}
  <rect x="0" y="468" width="512" height="44" fill="#2C2620" />
  <text x="256" y="496" class="label" font-size="20" fill="#F7F1E6" text-anchor="middle">${escapeXml(caption)}</text>
</svg>`;
}

function pathToFileUrl(p: string): string {
  const abs = path.resolve(p).split(path.sep).join("/");
  return `file://${abs.startsWith("/") ? "" : "/"}${encodeURI(abs).replace(/#/g, "%23")}`;
}

function escapeXml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function renderSkuPng(
  sku: Sku,
  glaze: Glaze,
  fontPath = resolveFontPath(),
): Promise<Buffer> {
  const svg = skuSvg(sku, glaze, fontPath);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

export async function writeSkuImages(
  skus: Sku[],
  glazes: Glaze[],
  fontPath = resolveFontPath(),
): Promise<{ id: string; bytes: number; file: string }[]> {
  mkdirSync(publicImageDir, { recursive: true });
  mkdirSync(dataImageDir, { recursive: true });
  const byId = new Map(glazes.map((g) => [g.id, g]));
  const written: { id: string; bytes: number; file: string }[] = [];
  for (const sku of skus) {
    const glaze = byId.get(sku.glazeId);
    if (!glaze) throw new Error(`missing glaze ${sku.glazeId} for ${sku.id}`);
    const buf = await renderSkuPng(sku, glaze, fontPath);
    const file = path.join(publicImageDir, `${sku.id}.png`);
    writeFileSync(file, buf);
    writeFileSync(path.join(dataImageDir, `${sku.id}.png`), buf);
    written.push({ id: sku.id, bytes: buf.length, file });
  }
  return written;
}
