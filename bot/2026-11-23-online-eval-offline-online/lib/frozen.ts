import results from "../data/results.json";
import questions from "../data/questions.json";
import type { OnlineTrace, Step } from "./online";

export type Pipeline = "fixed" | "agentic";
export type FrozenRow = {
  qid: string;
  run: number;
  type: string;
  pipeline: Pipeline;
  finishReason: string;
  answer: string[] | null;
  rationale: string | null;
  steps: Step[];
  gold: string[];
  correct: boolean;
  f1: number;
};

export const rows: readonly FrozenRow[] = results.rows as FrozenRow[];
export const frozenQuestions = questions.questions;

export const source = {
  commit: "37bc3eefe3536fe2cb70b94ff1ee5dd3eab481b7",
  endedAt: results.meta.endedAt,
  directory: "bot/2026-11-18-agentic-rag-loop",
  files: [
    {
      path: "results.json",
      copy: "results.json",
      sha256: "067821e5a441e8a9f15292faf06c9d5e2a38b30ad145400b927a5f89a530aa5f",
      blob: "fd761b71959e7bfdf7f5728c9d074aca3b7abed0",
      introduced: "f6f5d160777acc6cf77034b845105fdf3eb068ad",
    },
    {
      path: "data/questions.json",
      copy: "questions.json",
      sha256: "4b44e4ca2e21547160944325d0f50a47ab22581af36a63f54f6916ae0dda3f16",
      blob: "d3a3566c305b2f179aa7568d0df878ea0cd4b862",
      introduced: "ae5074469b1549999194bf5dc1c8915913b29ad3",
    },
  ],
};

export function onlineTrace({ answer, steps }: FrozenRow): OnlineTrace {
  return {
    answer,
    steps: steps.map(({ step, finishReason, toolCalls, toolResults }) => ({
      step, finishReason, toolCalls, toolResults,
    })),
  };
}
