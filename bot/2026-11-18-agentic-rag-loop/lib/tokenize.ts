export type Tokenizer = (text: string) => string[];
const parts = (s: string) => {
  const t = s.toLowerCase();
  return t.includes("-") ? [t, ...t.split("-").filter(Boolean)] : [t];
};
export const bigramTokenize: Tokenizer = (text) =>
  (
    text.match(/[\p{Script=Han}]+|[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*/gu) ?? []
  ).flatMap((s) =>
    /\p{Script=Han}/u.test(s)
      ? s.length === 1
        ? [s]
        : Array.from({ length: s.length - 1 }, (_, i) => s.slice(i, i + 2))
      : parts(s),
  );
export const segmenterTokenize: Tokenizer = (text) => {
  const models = text.match(/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+/g) ?? [];
  const rest = text.replace(/[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)+/g, " ");
  return [
    ...models.flatMap(parts),
    ...Array.from(
      new Intl.Segmenter("zh", { granularity: "word" }).segment(rest),
    )
      .filter((x) => x.isWordLike)
      .flatMap((x) => parts(x.segment)),
  ];
};
