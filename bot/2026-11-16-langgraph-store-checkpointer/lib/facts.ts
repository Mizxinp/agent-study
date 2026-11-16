/**
 * Helpers for the "记住：k=v" fact format and Store namespaces.
 * Parsing is deterministic and does not call any LLM.
 */

export const FACTS_COLLECTION = "facts";

/** Default Store namespace for a user's facts: [userId, "facts"]. */
export function factsNamespace(userId: string): string[] {
  return [userId, FACTS_COLLECTION];
}

export type RememberedFact = {
  key: string;
  text: string;
};

/**
 * Parse a user turn as 「记住：k=v」 (fullwidth or ASCII colon / equals allowed).
 * Returns null when the turn is ordinary chat text.
 */
export function parseRememberCommand(text: string): RememberedFact | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^记住[：:]\s*(.+)$/u);
  if (!match) return null;
  const rest = match[1] ?? "";
  const eq = rest.search(/[=＝]/u);
  if (eq <= 0) return null;
  const key = rest.slice(0, eq).trim();
  const value = rest.slice(eq + 1).trim();
  if (!key || !value) return null;
  return { key, text: value };
}

export function lastUserText(messages: string[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.startsWith("用户：") || message.startsWith("用户:")) {
      return message.replace(/^用户[：:]/u, "");
    }
    if (message.startsWith("系统：") || message.startsWith("系统:")) {
      continue;
    }
    return message;
  }
  return messages.at(-1) ?? "";
}

export function userMessage(text: string): string {
  return `用户：${text}`;
}

export function systemMessage(text: string): string {
  return `系统：${text}`;
}

export function isUserMessage(text: string): boolean {
  return text.startsWith("用户：") || text.startsWith("用户:");
}

export function isSystemMessage(text: string): boolean {
  return text.startsWith("系统：") || text.startsWith("系统:");
}
