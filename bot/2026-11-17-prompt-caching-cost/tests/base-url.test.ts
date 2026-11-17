import { describe, expect, it } from "vitest";
import {
  joinAnthropicMessagesUrl,
  joinOpenAIUrl,
  resolveAnthropicBaseURL,
  resolveOpenAIBaseURL,
  stripTrailingSlash,
} from "../lib/base-url";

const FAKE_OPENAI = "https://llm.example.test/v1";
const FAKE_ANTHROPIC = "https://messages.example.test/v1";

describe("base URL joining (fake hosts only)", () => {
  it("strips trailing slashes", () => {
    expect(stripTrailingSlash("https://llm.example.test/v1/")).toBe(FAKE_OPENAI);
    expect(stripTrailingSlash("https://llm.example.test/v1///")).toBe(FAKE_OPENAI);
  });

  it("prefers OPENAI_BASE_URL over CR_OPENAI_BASE_URL and strips slashes", () => {
    expect(
      resolveOpenAIBaseURL({
        OPENAI_BASE_URL: "https://llm.example.test/v1/",
        CR_OPENAI_BASE_URL: "https://unused.example.test/v1",
      }),
    ).toBe(FAKE_OPENAI);
    expect(resolveOpenAIBaseURL({ CR_OPENAI_BASE_URL: `${FAKE_OPENAI}/` })).toBe(FAKE_OPENAI);
    expect(resolveOpenAIBaseURL({})).toBeUndefined();
  });

  it("prefers ANTHROPIC_BASE_URL over CR_ANTHROPIC_BASE_URL", () => {
    expect(
      resolveAnthropicBaseURL({
        ANTHROPIC_BASE_URL: "https://messages.example.test/v1/",
        CR_ANTHROPIC_BASE_URL: "https://unused.example.test/v1",
      }),
    ).toBe(FAKE_ANTHROPIC);
    expect(resolveAnthropicBaseURL({ CR_ANTHROPIC_BASE_URL: FAKE_ANTHROPIC })).toBe(FAKE_ANTHROPIC);
  });

  it("joins OpenAI paths without doubling /v1", () => {
    expect(joinOpenAIUrl(FAKE_OPENAI, "/chat/completions")).toBe(
      "https://llm.example.test/v1/chat/completions",
    );
    expect(joinOpenAIUrl(`${FAKE_OPENAI}/`, "/responses")).toBe(
      "https://llm.example.test/v1/responses",
    );
    expect(joinOpenAIUrl(FAKE_OPENAI, "/embeddings")).toBe("https://llm.example.test/v1/embeddings");
  });

  it("joins Anthropic messages without doubling /v1", () => {
    expect(joinAnthropicMessagesUrl(FAKE_ANTHROPIC)).toBe(
      "https://messages.example.test/v1/messages",
    );
    expect(joinAnthropicMessagesUrl(`${FAKE_ANTHROPIC}/`)).toBe(
      "https://messages.example.test/v1/messages",
    );
  });
});
