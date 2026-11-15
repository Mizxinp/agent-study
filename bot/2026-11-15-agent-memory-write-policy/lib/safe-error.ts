const keyVariables = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "AI_GATEWAY_API_KEY",
] as const;

/** Only expose class/message, never the provider object, stack, or headers. */
export function safeError(error: unknown): string {
  let message =
    error instanceof Error
      ? `${error.name}: ${error.message}`
      : "Error: Unknown evaluation failure";
  for (const variable of keyVariables) {
    const secret = process.env[variable];
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  return message
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED]")
    .replace(
      /(?:headers?|authorization|x-api-key)\s*[=:][\s\S]*/gi,
      "[REDACTED headers]",
    );
}
