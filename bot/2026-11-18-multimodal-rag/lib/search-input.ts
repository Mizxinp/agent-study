/** 纯函数：校验 POST /api/search 的输入，不加载任何模型。 */
export type SearchInput = {
  q: string;
  querySkuId: string;
  hasImage: boolean;
};

export type SearchInputError = { status: 400; error: string };

export const EMPTY_SEARCH_ERROR =
  "请求为空：请提供文本查询 q、上传查询图 image，或指定 querySkuId";
export const QUERY_TOO_LONG_ERROR = "查询最多512字符";

export function normalizeSearchInput(raw: {
  q?: unknown;
  querySkuId?: unknown;
  hasImage?: boolean;
}): SearchInput {
  const q = typeof raw.q === "string" ? raw.q.trim() : "";
  const querySkuId =
    typeof raw.querySkuId === "string" ? raw.querySkuId.trim() : "";
  return { q, querySkuId, hasImage: Boolean(raw.hasImage) };
}

export function validateSearchInput(
  input: SearchInput,
): SearchInputError | null {
  if (input.q.length > 512) return { status: 400, error: QUERY_TOO_LONG_ERROR };
  if (!input.q && !input.hasImage && !input.querySkuId)
    return { status: 400, error: EMPTY_SEARCH_ERROR };
  return null;
}

/** 解析 JSON 请求体；空体或非法 JSON 视为空对象，交给 validateSearchInput 返回 400。 */
export function parseJsonBody(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
