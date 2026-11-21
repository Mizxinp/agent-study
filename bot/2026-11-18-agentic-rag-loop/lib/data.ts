import chunksJson from "../data/chunks.json";
import productsJson from "../data/products.json";
import questionsJson from "../data/questions.json";

export type Product = {
  sku: string;
  docId: string;
  name: string;
  series: string;
  glaze: string;
  shape: string;
  capacityMl: number;
  mouthCm: number;
  priceCny: number;
  listedAt: string;
};
export type QuestionType = "single" | "multi" | "null";
export type Question = {
  id: string;
  type: QuestionType;
  question: string;
  gold: string[];
  note: string;
};
export type Chunk = {
  id: string;
  docId: string;
  model: string;
  section: string;
  text: string;
};

export const products: Product[] = productsJson.products;
export const questions: Question[] = questionsJson.questions as Question[];
export const questionsFinalizedAt: string = questionsJson.finalizedAt;
export const allSkus = products.map((p) => p.sku);

export function attributeChunkText(p: Product): string {
  return (
    `属性表（合成数据）｜${p.name}（${p.sku}）\n` +
    `型号 ${p.sku}；系列 ${p.series}；釉色 ${p.glaze}；器型 ${p.shape}；` +
    `标称容积 ${p.capacityMl}ml；口径 ${p.mouthCm}cm；售价 ${p.priceCny}元；上架日期 ${p.listedAt}。`
  );
}

/** 检索语料：2.1 的 112 个正文块（带标题/型号上下文）+ 16 条属性表块。 */
export const corpus: Chunk[] = [
  ...chunksJson.map((c) => ({
    id: c.id,
    docId: c.docId,
    model: c.model,
    section: c.section,
    text: c.contextualText,
  })),
  ...products.map((p) => ({
    id: `attr-${p.sku}`,
    docId: p.docId,
    model: p.sku,
    section: "属性表",
    text: attributeChunkText(p),
  })),
];
