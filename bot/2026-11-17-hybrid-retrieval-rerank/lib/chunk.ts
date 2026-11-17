export const CHUNK_MAX_CHARS = 160;
/** 相邻块复用上一块最后一句；该句超过 60 字符或复用会超过块长上限则不复用。 */
export const OVERLAP = { sentences: 1, maxSentenceChars: 60 } as const;
export interface ProductDoc { id: string; title: string; model: string; sections: { title: string; text: string }[] }
export interface Chunk { id: string; docId: string; title: string; model: string; section: string; text: string; contextualText: string }
export function buildChunks(docs: readonly ProductDoc[]): Chunk[] {
  const len = (s: string) => Array.from(s).length;
  return docs.flatMap(doc => doc.sections.flatMap((section, sectionIndex) => {
    const sentences = section.text.match(/[^。？！!?；;]+[。？！!?；;]?/gu) ?? [];
    // 超长单句按字符切开，确保任意输入均满足最大块长。
    const units = sentences.flatMap(s => { const chars = Array.from(s); return Array.from({ length: Math.ceil(chars.length / CHUNK_MAX_CHARS) }, (_, i) => chars.slice(i * CHUNK_MAX_CHARS, (i + 1) * CHUNK_MAX_CHARS).join('')); });
    const blocks: string[] = []; let current: string[] = [];
    for (const unit of units) {
      if (len(current.join('') + unit) > CHUNK_MAX_CHARS) {
        blocks.push(current.join('')); const last = current.at(-1)!;
        current = len(last) <= OVERLAP.maxSentenceChars && len(last + unit) <= CHUNK_MAX_CHARS ? [last] : [];
      }
      current.push(unit);
    }
    if (current.length) blocks.push(current.join(''));
    return blocks.map((text, n) => ({ id: `${doc.id}-s${sectionIndex}-c${n}`, docId: doc.id, title: doc.title, model: doc.model, section: section.title, text,
      // H4 确定性前缀为文档标题 + 小节名；型号也视为标题的一部分。
      contextualText: `${doc.title}（${doc.model}）｜${section.title}\n${text}` }));
  }));
}
/** 核心词为去掉产地后的品名，以及继续去掉通用材质前缀的品名。 */
export function hasProductName(text: string, doc: Pick<ProductDoc, 'title' | 'model'>): boolean {
  const short = doc.title.replace(/^德化/, ''); const core = short.replace(/^(?:白瓷|羊脂玉|象牙白|中国白|建白)+/, '');
  return [doc.title, doc.model, short, core].some(word => word.length >= 2 && text.includes(word));
}
