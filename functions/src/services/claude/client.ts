// =============================================================================
// Claude Client — SDK singleton (per CF instance)
//
// Mirrors the Gemini client pattern: lazy-initialized singleton that persists
// across requests within the same Cloud Function instance.
// =============================================================================

import Anthropic from "@anthropic-ai/sdk";

// --- Singleton client (per CF instance) ---

let cachedClient: Anthropic | null = null;
let cachedKey = "";

/**
 * Get or create the Anthropic SDK client singleton.
 * Reuses the same instance within a CF warm instance as long as the key matches.
 */
export function getClaudeClient(apiKey: string): Anthropic {
    if (cachedClient && cachedKey === apiKey) return cachedClient;
    cachedClient = new Anthropic({ apiKey });
    cachedKey = apiKey;
    return cachedClient;
}
