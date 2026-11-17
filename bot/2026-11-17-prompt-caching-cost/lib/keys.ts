export type AvailableKeys = {
  openai: boolean;
  anthropic: boolean;
  gateway: boolean;
};

export function detectKeys(env: NodeJS.ProcessEnv = process.env): AvailableKeys {
  return {
    openai: Boolean(env.OPENAI_API_KEY),
    anthropic: Boolean(env.ANTHROPIC_API_KEY),
    gateway: Boolean(env.AI_GATEWAY_API_KEY),
  };
}

export function missingKeyNames(keys: AvailableKeys = detectKeys()): string[] {
  const missing: string[] = [];
  if (!keys.openai) missing.push("OPENAI_API_KEY");
  if (!keys.anthropic) missing.push("ANTHROPIC_API_KEY");
  if (!keys.gateway) missing.push("AI_GATEWAY_API_KEY");
  return missing;
}

export function hasAnyProviderKey(keys: AvailableKeys = detectKeys()): boolean {
  return keys.openai || keys.anthropic || keys.gateway;
}
