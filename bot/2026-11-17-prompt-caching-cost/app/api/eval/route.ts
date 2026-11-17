import { NextResponse } from "next/server";
import { runEval } from "../../../lib/eval-runner";
import { detectKeys, missingKeyNames } from "../../../lib/keys";
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  DEFAULT_TARGET_PREFIX_TOKENS,
} from "../../../lib/prices";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const keys = detectKeys();
  return NextResponse.json({
    keys: {
      OPENAI_API_KEY: keys.openai,
      ANTHROPIC_API_KEY: keys.anthropic,
      AI_GATEWAY_API_KEY: keys.gateway,
    },
    missing: missingKeyNames(keys),
    ready: keys.openai || keys.anthropic || keys.gateway,
  });
}

export async function POST() {
  const outcome = await runEval({
    config: {
      targetPrefixTokens: Number(process.env.TARGET_PREFIX_TOKENS) || DEFAULT_TARGET_PREFIX_TOKENS,
      maxOutputTokens: Number(process.env.MAX_OUTPUT_TOKENS) || DEFAULT_MAX_OUTPUT_TOKENS,
      prewarm: process.env.EVAL_PREWARM === "1" || process.env.EVAL_PREWARM === "true",
    },
  });
  if (!outcome.ok) {
    return NextResponse.json(outcome, { status: 503 });
  }
  return NextResponse.json(outcome);
}
