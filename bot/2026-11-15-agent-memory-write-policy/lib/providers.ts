import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { gateway } from "ai";
export const missingKeyMessage =
  "Missing model API key: set OPENAI_API_KEY (recommended), ANTHROPIC_API_KEY (BM25-only unless an embedding provider is available), or AI_GATEWAY_API_KEY.";
export function providers() {
  const provider = process.env.OPENAI_API_KEY
    ? "openai"
    : process.env.ANTHROPIC_API_KEY
      ? "anthropic"
      : process.env.AI_GATEWAY_API_KEY
        ? "gateway"
        : undefined;
  if (!provider) throw new Error(missingKeyMessage);
  const answerId =
    process.env.ANSWER_MODEL ||
    (provider === "openai"
      ? "gpt-4o-mini"
      : provider === "anthropic"
        ? "claude-haiku-4-5"
        : "openai/gpt-4o-mini");
  const judgeId =
    process.env.JUDGE_MODEL ||
    (provider === "openai"
      ? "gpt-4o"
      : provider === "anthropic"
        ? "claude-sonnet-4-5"
        : "openai/gpt-4o");
  if (answerId === judgeId)
    throw new Error(
      "JUDGE_MODEL must differ from ANSWER_MODEL (choose another provider or tier).",
    );
  const language = (id: string) =>
    provider === "openai"
      ? createOpenAI()(id)
      : provider === "anthropic"
        ? createAnthropic()(id)
        : gateway(id);
  const embeddingId =
    process.env.EMBEDDING_MODEL ||
    (provider === "gateway"
      ? "openai/text-embedding-3-small"
      : "text-embedding-3-small");
  const embedding = process.env.OPENAI_API_KEY
    ? createOpenAI().embedding(embeddingId)
    : process.env.AI_GATEWAY_API_KEY
      ? gateway.embedding(
          process.env.EMBEDDING_MODEL || "openai/text-embedding-3-small",
        )
      : undefined;
  return {
    answer: language(answerId),
    judge: language(judgeId),
    embedding,
    metadata: {
      provider,
      answerId,
      extractionId: answerId,
      judgeId,
      embeddingId: embedding?.modelId ?? null,
      retrieval: embedding ? "cosine" : "BM25-only",
      temperature: 0,
    },
  };
}
