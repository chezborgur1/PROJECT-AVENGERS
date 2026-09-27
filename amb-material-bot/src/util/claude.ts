import Anthropic from "@anthropic-ai/sdk";

// One place for how the bot talks to Claude.
//
// - Structured outputs (a Zod schema) so every response parses into typed data.
// - `fallbacks: "default"`: if Claude Opus 5's safety classifiers decline a
//   request (a false positive on, say, a tax return full of SSNs), the API
//   re-runs it server-side on Anthropic's recommended fallback model instead
//   of failing the whole request.

export const CLAUDE_MODEL = process.env.AMB_CLAUDE_MODEL || "claude-opus-5";

let client: Anthropic | undefined;

export function claudeAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function claude(): Anthropic {
  client ??= new Anthropic({ timeout: 15 * 60 * 1000 });
  return client;
}

/** Spread into every `client.beta.messages.*` call. A function so each call gets its own arrays. */
export function fallbackOptions(): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } {
  return { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

/** Throw a readable error unless the model finished normally. */
export function assertFinished(stopReason: string | null, what: string): void {
  if (stopReason === "refusal") throw new Error(`Claude declined to process ${what}`);
  if (stopReason === "max_tokens") throw new Error(`Claude's output for ${what} was cut off (max_tokens)`);
}
