import { hybridSearch } from "../lib/retrieval";
import { questions } from "../lib/data";
const t0 = Date.now();
for (const q of questions.slice(0, 40)) {
  const hits = await hybridSearch(q.question, 8);
  const models = [...new Set(hits.map((h) => h.model))];
  const cover = q.gold.filter((g) => models.includes(g)).length;
  console.log(q.id, `${cover}/${q.gold.length}`, hits.map((h) => h.id).join(" "));
}
console.log("ms", Date.now() - t0);
