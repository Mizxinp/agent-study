import type { ModelMessage } from "ai";
import { changingQuestion } from "./prefix";

export const ANTHROPIC_CACHE_CONTROL = { type: "ephemeral" as const, ttl: "5m" as const };
export const OPENAI_BREAKPOINT = { mode: "explicit" as const };

type PromptKind = "h1-prefix" | "h2-on-question" | "no-cache";

export type PromptBuildOptions = {
  kind: PromptKind;
  prefix: string;
  question: string;
};

/**
 * Shared message construction for Anthropic and OpenAI.
 * H1 places the cache breakpoint at the end of the stable prefix (system message).
 * H2 places it only on the changing user question.
 * no-cache omits every cache marker (OpenAI explicit mode with no breakpoints
 * should not write a cache; Anthropic has no cache_control).
 */
export function buildMessages(options: PromptBuildOptions): ModelMessage[] {
  const { kind, prefix, question } = options;
  const prefixMessage: ModelMessage = {
    role: "system",
    content: prefix,
    ...(kind === "h1-prefix"
      ? {
          providerOptions: {
            anthropic: { cacheControl: ANTHROPIC_CACHE_CONTROL },
            openai: { promptCacheBreakpoint: OPENAI_BREAKPOINT },
          },
        }
      : {}),
  };

  const userMessage: ModelMessage =
    kind === "h2-on-question"
      ? {
          role: "user",
          content: [
            {
              type: "text",
              text: question,
              providerOptions: {
                anthropic: { cacheControl: ANTHROPIC_CACHE_CONTROL },
                openai: { promptCacheBreakpoint: OPENAI_BREAKPOINT },
              },
            },
          ],
        }
      : { role: "user", content: question };

  return [prefixMessage, userMessage];
}

export function buildH1Messages(prefix: string, question: string): ModelMessage[] {
  return buildMessages({ kind: "h1-prefix", prefix, question });
}

export function buildH2Messages(prefix: string, question: string, stamp: string): ModelMessage[] {
  return buildMessages({
    kind: "h2-on-question",
    prefix,
    question: changingQuestion(question, stamp),
  });
}

export function buildUncachedMessages(prefix: string, question: string): ModelMessage[] {
  return buildMessages({ kind: "no-cache", prefix, question });
}

export function openaiRequestOptions(kind: PromptKind, prewarm = false) {
  return {
    promptCacheOptions: {
      mode: "explicit" as const,
      ttl: "30m" as const,
      ...(prewarm ? { prewarm: true } : {}),
    },
    reasoningEffort: "low" as const,
  };
}

export function anthropicRequestOptions(prewarm = false) {
  return {
    // Do not set top-level cacheControl: that enables automatic caching and
    // would move the breakpoint to the last cacheable block (the question).
    ...(prewarm ? {} : {}),
  };
}
