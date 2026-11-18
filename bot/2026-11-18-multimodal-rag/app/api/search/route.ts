import { loadCatalog } from "../../../lib/catalog";
import { searchImage, searchImageBySku, searchText } from "../../../lib/index";
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
    let q = "";
    let image: Buffer | undefined;
    let querySkuId = "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      q = String(form.get("q") ?? "").trim();
      querySkuId = String(form.get("querySkuId") ?? "").trim();
      const file = form.get("image");
      if (file instanceof File && file.size > 0) {
        image = Buffer.from(await file.arrayBuffer());
      }
    } else {
      const body = (await request.json()) as {
        q?: string;
        image?: string;
        querySkuId?: string;
      };
      q = body.q?.trim() ?? "";
      querySkuId = body.querySkuId?.trim() ?? "";
      if (body.image) image = Buffer.from(body.image, "base64");
    }
    if (q.length > 512)
      return Response.json({ error: "查询最多512字符" }, { status: 400 });
    if (!q && !image && !querySkuId)
      return Response.json({ error: "请输入查询或上传查询图" }, { status: 400 });

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

