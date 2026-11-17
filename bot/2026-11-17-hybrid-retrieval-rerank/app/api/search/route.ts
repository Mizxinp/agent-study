import { searchAll } from "../../../lib/pipeline";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("q");
  if (raw && raw.length > 512)
    return Response.json({ error: "查询最多512字符" }, { status: 400 });
  const q = raw?.trim();
  if (!q) return Response.json({ error: "请输入查询" }, { status: 400 });
  try {
    return Response.json(await searchAll(q));
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 });
  }
}
