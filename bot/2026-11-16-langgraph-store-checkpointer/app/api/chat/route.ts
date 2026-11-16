import { NextResponse } from "next/server";

import {
  DEFAULT_USER_ID,
  getDemoRuntime,
  resetDemoRuntime,
  THREAD_A,
  THREAD_B,
} from "@/lib/runtime";
import { listUserFacts } from "@/lib/serialize";
import { readThreadMessages, runTurn } from "@/lib/graph";

type ChatBody = {
  threadId?: string;
  userId?: string;
  text?: string;
  reset?: boolean;
};

async function snapshot(userId: string) {
  const { graph, store } = getDemoRuntime();
  const [threadA, threadB, facts] = await Promise.all([
    readThreadMessages(graph, THREAD_A),
    readThreadMessages(graph, THREAD_B),
    listUserFacts(store, userId),
  ]);
  return {
    userId,
    threads: {
      [THREAD_A]: threadA,
      [THREAD_B]: threadB,
    },
    facts,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as ChatBody;
  const userId =
    typeof body.userId === "string" && body.userId.trim()
      ? body.userId.trim()
      : DEFAULT_USER_ID;

  if (body.reset) {
    resetDemoRuntime();
    return NextResponse.json(await snapshot(userId));
  }

  const threadId = body.threadId;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (threadId !== THREAD_A && threadId !== THREAD_B) {
    return NextResponse.json(
      { error: "threadId must be thread-a or thread-b" },
      { status: 400 },
    );
  }
  if (!text) {
    return NextResponse.json({ error: "text is required" }, { status: 400 });
  }

  const { graph } = getDemoRuntime();
  await runTurn({ graph, userId, threadId, text });
  return NextResponse.json(await snapshot(userId));
}
