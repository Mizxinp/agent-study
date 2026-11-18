import { loadCatalog } from "../../../lib/catalog";
import { searchImage, searchImageBySku, searchText } from "../../../lib/index";
import {
  normalizeSearchInput,
  parseJsonBody,
  validateSearchInput,
} from "../../../lib/search-input";
import type { Hit } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enrich(hits: Hit[]) {
  const catalog = loadCatalog();
  const byId = new Map(catalog.skus.map((s) => [s.id, s]));
  return hits.map((h) => {
    const sku = byId.get(h.id);
    return {
      ...h,
      caption: sku?.caption,
      image: sku ? `/images/${sku.id}.png` : undefined,
    };
  });
}

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let raw: Record<string, unknown> = {};
    let image: Buffer | undefined;
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      raw = { q: form.get("q") ?? "", querySkuId: form.get("querySkuId") ?? "" };
      const file = form.get("image");
      if (file instanceof File && file.size > 0) {
        image = Buffer.from(await file.arrayBuffer());
      }
    } else {
      raw = parseJsonBody(await request.text());
      if (typeof raw.image === "string" && raw.image)
        image = Buffer.from(raw.image, "base64");
    }
    const { q, querySkuId } = normalizeSearchInput(raw);
    const invalid = validateSearchInput({ q, querySkuId, hasImage: !!image });
    if (invalid)
      return Response.json({ error: invalid.error }, { status: invalid.status });

    if (querySkuId) {
      const result = await searchImageBySku(querySkuId);
      return Response.json({
        querySkuId,
        lanes: {
          "text-bge": enrich(result.lanes["text-bge"]),
          vision: enrich(result.lanes.vision),
          fusion: enrich(result.lanes.fusion),
        },
        models: result.models,
      });
    }
    if (image) {
      const result = await searchImage(image);
      return Response.json({
        lanes: {
          "text-bge": q ? enrich((await searchText(q)).lanes["text-bge"]) : [],
          vision: enrich(result.lanes.vision),
          fusion: enrich(result.lanes.fusion),
        },
        models: result.models,
      });
    }
    const result = await searchText(q);
    return Response.json({
      lanes: {
        "text-bge": enrich(result.lanes["text-bge"]),
        vision: enrich(result.lanes.vision),
        fusion: enrich(result.lanes.fusion),
      },
      models: result.models,
    });
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}

