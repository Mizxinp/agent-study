import type { Question } from "./dataset";
export const normalize = (s: string) =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
export function matchAnswer(q: Question, answer: string) {
  const a = normalize(answer),
    has = (s: string) => a.includes(normalize(s));
  const stale = q.type === "current" && q.old.some(has);
  // Mere mention of the friend's value can be a correct rejection: ask judge in that case.
  const ambiguousDistractor = q.avoid.some(has);
  if (q.type === "history" || ambiguousDistractor)
    return { correct: undefined, stale, distractor: undefined };
  return { correct: q.gold.some(has) && !stale, stale, distractor: false };
}
