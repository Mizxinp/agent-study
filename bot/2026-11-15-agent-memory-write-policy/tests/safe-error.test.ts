import { afterEach, expect, it, vi } from "vitest";
import { safeError } from "../lib/safe-error";
afterEach(() => vi.unstubAllEnvs());
it("prints error class/message while scrubbing all configured keys and sk strings", () => {
  vi.stubEnv("OPENAI_API_KEY", "test-openai-value");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-value");
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-value");
  expect(
    safeError(
      new TypeError(
        "failed test-openai-value test-anthropic-value test-gateway-value sk-example_123",
      ),
    ),
  ).toBe("TypeError: failed [REDACTED] [REDACTED] [REDACTED] [REDACTED]");
});
it("never serializes payloads or headers", () => {
  const error = Object.assign(
    new Error("request failed; headers: { private: value }"),
    { headers: { private: "hidden" } },
  );
  expect(safeError(error)).toBe("Error: request failed; [REDACTED headers]");
  expect(safeError({ headers: { private: "hidden" } })).toBe(
    "Error: Unknown evaluation failure",
  );
});
