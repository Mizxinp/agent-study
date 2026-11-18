import { expect, it } from "vitest";
import {
  EMPTY_SEARCH_ERROR,
  normalizeSearchInput,
  parseJsonBody,
  validateSearchInput,
} from "../lib/search-input";

it("空请求（无 q、无 image、无 querySkuId）返回 400 与明确错误，不加载模型", () => {
  for (const body of ["", "   ", "{}", "not json", "[]", '{"q":"   "}']) {
    const input = normalizeSearchInput(parseJsonBody(body));
    expect(validateSearchInput(input)).toEqual({
      status: 400,
      error: EMPTY_SEARCH_ERROR,
    });
  }
  expect(validateSearchInput(normalizeSearchInput({ q: 123 }))?.status).toBe(400);
});

it("有 q / image / querySkuId 任一项即通过；超长 q 返回 400", () => {
  expect(validateSearchInput(normalizeSearchInput({ q: "粉青" }))).toBeNull();
  expect(validateSearchInput(normalizeSearchInput({ hasImage: true }))).toBeNull();
  expect(
    validateSearchInput(normalizeSearchInput({ querySkuId: "DH-TC-0915" })),
  ).toBeNull();
  expect(
    validateSearchInput(normalizeSearchInput({ q: "a".repeat(513) }))?.status,
  ).toBe(400);
});
