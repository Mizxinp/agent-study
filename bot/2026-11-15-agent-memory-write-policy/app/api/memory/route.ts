import { chatState } from "../../../lib/chat-store";
import { providers, missingKeyMessage } from "../../../lib/providers";
export async function GET(req: Request) {
  try {
    providers();
  } catch {
    return Response.json({ error: missingKeyMessage }, { status: 503 });
  }
  const q = new URL(req.url).searchParams,
    id = q.get("clientId"),
    strategy = q.get("strategy");
  if (
    !id ||
    !/^[0-9a-f-]{36}$/i.test(id) ||
    !["add-only", "crud"].includes(strategy ?? "")
  )
    return Response.json(
      { error: "Invalid clientId or strategy" },
      { status: 400 },
    );
  const state = chatState(id, strategy!);
  return Response.json({
    busy: state.busy,
    error: state.error,
    events: state.store.events,
    memories: state.store.memories.map(({ vector, ...m }) => m),
  });
}
