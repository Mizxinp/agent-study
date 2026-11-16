import { NextResponse } from "next/server";

import {
  DEFAULT_USER_ID,
  getDemoRuntime,
  THREAD_A,
  THREAD_B,
} from "@/lib/runtime";
import { listUserFacts } from "@/lib/serialize";
import { readThreadMessages } from "@/lib/graph";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim() || DEFAULT_USER_ID;
  const { graph, store } = getDemoRuntime();
  const [threadA, threadB, facts] = await Promise.all([
    readThreadMessages(graph, THREAD_A),
    readThreadMessages(graph, THREAD_B),
    listUserFacts(store, userId),
  ]);
  return NextResponse.json({
    userId,
    threads: {
      [THREAD_A]: threadA,
      [THREAD_B]: threadB,
    },
    facts,
  });
}
