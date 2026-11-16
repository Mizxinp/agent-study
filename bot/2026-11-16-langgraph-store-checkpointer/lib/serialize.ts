import type { Item } from "@langchain/langgraph";

import { factsNamespace } from "./facts";

/** JSON-safe Store item for the page / API (Dates become ISO-8601 strings). */
export type StoreItemView = {
  namespace: string[];
  key: string;
  value: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function serializeStoreItem(item: Item): StoreItemView {
  return {
    namespace: item.namespace,
    key: item.key,
    value: item.value,
    createdAt: toIso(item.createdAt),
    updatedAt: toIso(item.updatedAt),
  };
}

function toIso(value: Date | string | number): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return value;
}

export async function listUserFacts(
  store: { search: (ns: string[], options?: { limit?: number }) => Promise<Item[]> },
  userId: string,
): Promise<StoreItemView[]> {
  const items = await store.search(factsNamespace(userId), { limit: 100 });
  return items.map(serializeStoreItem);
}
