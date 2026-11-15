import { streamText } from "ai";
import { providers, missingKeyMessage } from "../../../lib/providers";
import { answerSystem } from "../../../lib/memory";
import { chatState } from "../../../lib/chat-store";
import { z } from "zod";
export const runtime = "nodejs";
export async function POST(req: Request) {
  let p;
  try {
    p = providers();
  } catch {
    return Response.json({ error: missingKeyMessage }, { status: 503 });
  }
  const parsed = z
    .object({
      clientId: z.string().uuid(),
      strategy: z.enum(["add-only", "crud"]),
      messages: z
        .array(
          z.object({
            role: z.enum(["user", "assistant", "system"]),
            parts: z.array(
              z.object({ type: z.string(), text: z.string().optional() }),
            ),
          }),
        )
        .min(1),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Invalid chat request" }, { status: 400 });
  const { clientId, strategy, messages } = parsed.data;
  const state = chatState(clientId, strategy);
  if (state.busy)
    return Response.json(
      { error: "Previous turn is still writing memory." },
      { status: 409 },
    );
  const text = messages
    .at(-1)!
    .parts.filter((p) => p.type === "text")
    .map((p) => p.text ?? "")
    .join("");
  state.busy = true;
  state.error = undefined;
  try {
    const context = await state.store.context(text, true);
    const result = streamText({
      model: p.answer,
      temperature: 0,
      maxRetries: 0,
      system: answerSystem,
      prompt: `已存记忆：\n${context}\n客户本轮：${text}`,
      onFinish: async ({ text: answer }) => {
        try {
          await state.store.write(
            strategy,
            `user: ${text}\nassistant: ${answer}`,
            new Date().toISOString(),
          );
        } catch {
          state.error =
            "Memory write failed. Check model configuration, quota and network.";
        } finally {
          state.busy = false;
        }
      },
      onError: () => {
        state.error =
          "Model stream failed. Check model configuration, quota and network.";
        state.busy = false;
      },
    });
    return result.toUIMessageStreamResponse({
      onError: () =>
        "Model request failed. Check model configuration, quota and network.",
    });
  } catch {
    state.busy = false;
    return Response.json(
      {
        error:
          "Model request failed. Check model configuration, quota and network.",
      },
      { status: 502 },
    );
  }
}
