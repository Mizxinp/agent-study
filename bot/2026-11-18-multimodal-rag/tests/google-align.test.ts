import { expect, it } from "vitest";
import type { EmbeddingModelV4 } from "@ai-sdk/provider";
import {
  assertContentAlignedWithValues,
  buildGoogleEmbeddingParts,
  buildGoogleEmbeddingRequest,
  embedWithAlignedGoogleOptions,
  GoogleContentLengthError,
  type GoogleEmbeddingContentPart,
} from "../lib/google-align";

const image: GoogleEmbeddingContentPart = {
  type: "image",
  data: "aaa",
  mediaType: "image/png",
};

it("providerOptions.google.content 必须与 values 等长，否则抛错", async () => {
  expect(() =>
    assertContentAlignedWithValues(["a", "b"], [[image]]),
  ).toThrow(GoogleContentLengthError);
  expect(() => assertContentAlignedWithValues(["a"], [[image]])).not.toThrow();
  expect(() => assertContentAlignedWithValues(["a"])).not.toThrow();

  const fetchImpl = async () => {
    throw new Error("fetch should not run when lengths differ");
  };
  await expect(
    embedWithAlignedGoogleOptions({
      values: ["q1", "q2"],
      providerOptions: { google: { content: [[image]] } },
      fetchImpl,
    }),
  ).rejects.toBeInstanceOf(GoogleContentLengthError);
});

it("values 为空字符串时请求 parts 只有图；非空时文本 part 在前", () => {
  expect(buildGoogleEmbeddingParts("", [image])).toEqual([image]);
  expect(buildGoogleEmbeddingParts("釉色", [image])).toEqual([
    { type: "text", text: "釉色" },
    image,
  ]);
  const requests = buildGoogleEmbeddingRequest(["", "口径 8.2cm"], [[image], [image]]);
  expect(requests[0].parts[0]).toEqual(image);
  expect(requests[0].parts.some((p) => p.type === "text")).toBe(false);
  expect(requests[1].parts[0]).toEqual({ type: "text", text: "口径 8.2cm" });
});

it("假的 EmbeddingModelV4 + 自定义 fetch 也会在不等长时抛错", async () => {
  const fake: EmbeddingModelV4 = {
    specificationVersion: "v4",
    provider: "fake-google",
    modelId: "fake-embedding-001",
    maxEmbeddingsPerCall: 8,
    supportsParallelCalls: false,
    async doEmbed({ values, providerOptions }) {
      const content = (
        providerOptions as { google?: { content?: GoogleEmbeddingContentPart[][] } } | undefined
      )?.google?.content;
      const body = await embedWithAlignedGoogleOptions({
        values,
        providerOptions: { google: { content } },
        fetchImpl: async (req) => req,
      });
      return { embeddings: values.map(() => [0, 1]), warnings: [], raw: body };
    },
  };
  await expect(
    fake.doEmbed({
      values: ["a", "b"],
      providerOptions: { google: { content: [[image]] } },
    }),
  ).rejects.toBeInstanceOf(GoogleContentLengthError);
  const ok = await fake.doEmbed({
    values: [""],
    providerOptions: { google: { content: [[image]] } },
  });
  expect(ok.embeddings).toHaveLength(1);
});
