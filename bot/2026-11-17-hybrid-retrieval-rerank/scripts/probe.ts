import { rerank } from "ai";
import type { RerankingModelV4 } from "@ai-sdk/provider";
let calls = 0;
const model: RerankingModelV4 = {
  specificationVersion: "v4",
  provider: "local",
  modelId: "probe",
  async doRerank() {
    calls++;
    return {
      ranking: [
        { index: 0, relevanceScore: 0.1 },
        { index: 1, relevanceScore: 0.9 },
      ],
    };
  },
};
console.log(
  "unsorted",
  await rerank({ model, query: "q", documents: ["a", "b"] }),
);
try {
  await rerank({
    model: {
      ...model,
      doRerank: async () => ({ ranking: [{ index: 99, relevanceScore: 1 }] }),
    },
    query: "q",
    documents: ["a"],
    maxRetries: 0,
  });
} catch (e) {
  console.log("invalid", (e as Error).name);
}
calls = 0;
console.log(
  "empty",
  await rerank({ model, query: "q", documents: [] }),
  "calls",
  calls,
);
