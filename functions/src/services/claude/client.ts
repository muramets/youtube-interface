// =============================================================================
// Claude Client — SDK singleton (per CF instance)
//
// Mirrors the Gemini client pattern: lazy-initialized singleton that persists
// across requests within the same Cloud Function instance.
//
// ⚠️ Dynamic import: @anthropic-ai/sdk does heavy synchronous init at module
// load. Top-level import causes Firebase deploy timeout (10s). Lazy import
// defers SDK loading to first actual use.
// =============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedClient: any = null;
let cachedKey = "";

/**
 * Get or create the Anthropic SDK client singleton.
 * Reuses the same instance within a CF warm instance as long as the key matches.
 */
export async function getClaudeClient(apiKey: string) {
    if (cachedClient && cachedKey === apiKey) return cachedClient;
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    cachedClient = new Anthropic({ apiKey });
    cachedKey = apiKey;
    return cachedClient;
}
