// =============================================================================
// Gemini Client — SDK singleton + Gemini-specific types
// =============================================================================

// --- Lazy-loaded SDK types ---
type GoogleGenAI = import("@google/genai").GoogleGenAI;

// --- Singleton client (per CF instance) ---
let cachedClient: GoogleGenAI | null = null;
let cachedKey = "";

export async function getClient(apiKey: string): Promise<GoogleGenAI> {
    if (cachedClient && cachedKey === apiKey) return cachedClient;
    const { GoogleGenAI } = await import("@google/genai");
    cachedClient = new GoogleGenAI({ apiKey });
    cachedKey = apiKey;
    return cachedClient;
}

// --- Gemini-specific attachment type ---

/**
 * Gemini-specific attachment — extends the provider-agnostic AttachmentRef
 * with cached Gemini Files API URI and expiry.
 */
export interface ChatAttachment {
    type: "image" | "audio" | "video" | "file";
    url: string;
    name: string;
    mimeType: string;
    geminiFileUri?: string;
    geminiFileExpiry?: number;
}

// --- Re-exports from ai/types (canonical source of truth) ---
// TODO: remove after all consumers migrated to import from '../ai/types.js'
export type { HistoryMessage, TokenUsage, ToolCallRecord } from "../ai/types.js";

// --- Gemini URI TTL ---

export function isGeminiUriValid(expiryMs?: number): boolean {
    if (!expiryMs) return false;
    return expiryMs > Date.now() + 5 * 60 * 1000;
}
