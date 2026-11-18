/**
 * Minimal multimodal embedding request alignment helpers.
 * Mirrors the AI SDK Google embedding constraint that
 * providerOptions.google.content must be the same length as values,
 * and the part-ordering rule for empty vs non-empty value strings.
 * Does not call any remote API.
 */

export type GoogleEmbeddingImagePart = {
  type: "image";
  data: string;
  mediaType: string;
};

export type GoogleEmbeddingTextPart = {
  type: "text";
  text: string;
};

export type GoogleEmbeddingContentPart =
  | GoogleEmbeddingImagePart
  | GoogleEmbeddingTextPart;

export class GoogleContentLengthError extends Error {
  constructor(valuesLength: number, contentLength: number) {
    super(
      `providerOptions.google.content must be the same length as values (values=${valuesLength}, content=${contentLength})`,
    );
    this.name = "GoogleContentLengthError";
  }
}

export function assertContentAlignedWithValues(
  values: string[],
  content?: GoogleEmbeddingContentPart[][] | undefined,
): void {
  if (content === undefined) return;
  if (!Array.isArray(content) || content.length !== values.length) {
    throw new GoogleContentLengthError(
      values.length,
      Array.isArray(content) ? content.length : -1,
    );
  }
}

export function buildGoogleEmbeddingParts(
  value: string,
  content: GoogleEmbeddingContentPart[] = [],
): GoogleEmbeddingContentPart[] {
  const extra = content.filter((part) =>
    value === "" ? part.type !== "text" : true,
  );
  if (value === "") return extra;
  return [{ type: "text", text: value }, ...extra];
}

export function buildGoogleEmbeddingRequest(
  values: string[],
  content?: GoogleEmbeddingContentPart[][],
): { parts: GoogleEmbeddingContentPart[] }[] {
  assertContentAlignedWithValues(values, content);
  return values.map((value, i) => ({
    parts: buildGoogleEmbeddingParts(value, content?.[i] ?? []),
  }));
}

/** Fake EmbeddingModelV4-compatible wrapper used by H5 tests. */
export async function embedWithAlignedGoogleOptions(args: {
  values: string[];
  providerOptions?: { google?: { content?: GoogleEmbeddingContentPart[][] } };
  fetchImpl?: (body: unknown) => Promise<unknown>;
}): Promise<unknown> {
  const content = args.providerOptions?.google?.content;
  const body = { values: args.values, requests: buildGoogleEmbeddingRequest(args.values, content) };
  if (args.fetchImpl) return args.fetchImpl(body);
  return body;
}
