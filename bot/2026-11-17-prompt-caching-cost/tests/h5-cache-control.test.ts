import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

type AnthropicRequest = {
  model?: string;
  cache_control?: unknown;
  system?: unknown;
  messages?: Array<{
    role: string;
    content: unknown;
  }>;
};

type TextPart = {
  type?: string;
  text?: string;
  cache_control?: { type?: string; ttl?: string } | null;
};

function anthropicMessageResponse(model: string) {
  return {
    id: "msg_h5_fixture",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: 32,
      output_tokens: 1,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  };
}

async function captureAnthropicRequest(messages: ModelMessage[]): Promise<AnthropicRequest> {
  let captured: AnthropicRequest | undefined;
  const anthropic = createAnthropic({
    apiKey: "test-key-not-a-secret",
    fetch: async (_url, init) => {
      captured = JSON.parse(String(init?.body ?? "{}")) as AnthropicRequest;
      return new Response(JSON.stringify(anthropicMessageResponse("claude-sonnet-5-5")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  await generateText({
    model: anthropic("claude-sonnet-5-5"),
    messages,
    maxOutputTokens: 16,
  });

  if (!captured) throw new Error("The Anthropic request body was not intercepted.");
  return captured;
}

function userTextParts(request: AnthropicRequest): TextPart[] {
  const user = request.messages?.find((message) => message.role === "user");
  if (!user) throw new Error("Outgoing JSON has no user message.");
  if (!Array.isArray(user.content)) {
    throw new Error(`Expected user content to be an array, got ${JSON.stringify(user.content)}`);
  }
  return user.content as TextPart[];
}

function cacheControls(parts: TextPart[]): Array<TextPart["cache_control"] | undefined> {
  return parts.map((part) => part.cache_control ?? undefined);
}

describe("H5: ai@7.0.173 Anthropic cacheControl request JSON", () => {
  it("H5: message-level providerOptions.anthropic.cacheControl appears only on that message's last content part", async () => {
    const request = await captureAnthropicRequest([
      {
        role: "user",
        content: [
          { type: "text", text: "part-one: product intro" },
          { type: "text", text: "part-two: installation notes" },
          { type: "text", text: "part-three: last block of the message" },
        ],
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } },
        },
      },
    ]);

    expect(request.cache_control).toBeUndefined();
    const parts = userTextParts(request);
    expect(parts).toHaveLength(3);
    expect(parts.map((part) => part.text)).toEqual([
      "part-one: product intro",
      "part-two: installation notes",
      "part-three: last block of the message",
    ]);
    expect(cacheControls(parts)).toEqual([
      undefined,
      undefined,
      { type: "ephemeral", ttl: "5m" },
    ]);
  });

  it("H5: a part-level cacheControl mark takes precedence over the message-level mark on the same part", async () => {
    const request = await captureAnthropicRequest([
      {
        role: "user",
        content: [
          { type: "text", text: "part-one" },
          { type: "text", text: "part-two" },
          {
            type: "text",
            text: "part-three-last",
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
            },
          },
        ],
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } },
        },
      },
    ]);

    expect(request.cache_control).toBeUndefined();
    const parts = userTextParts(request);
    expect(cacheControls(parts)).toEqual([
      undefined,
      undefined,
      { type: "ephemeral", ttl: "1h" },
    ]);
  });

  it("H5: a non-last part-level mark stays on that part, and message-level still lands on the last part", async () => {
    const request = await captureAnthropicRequest([
      {
        role: "user",
        content: [
          { type: "text", text: "part-one" },
          {
            type: "text",
            text: "part-two-marked",
            providerOptions: {
              anthropic: { cacheControl: { type: "ephemeral", ttl: "1h" } },
            },
          },
          { type: "text", text: "part-three-last" },
        ],
        providerOptions: {
          anthropic: { cacheControl: { type: "ephemeral", ttl: "5m" } },
        },
      },
    ]);

    const parts = userTextParts(request);
    expect(cacheControls(parts)).toEqual([
      undefined,
      { type: "ephemeral", ttl: "1h" },
      { type: "ephemeral", ttl: "5m" },
    ]);
  });
});
