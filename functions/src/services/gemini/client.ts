// =============================================================================
// Gemini Client — SDK singleton + shared types
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

// --- Types ---

export interface ChatAttachment {
    type: "image" | "audio" | "video" | "file";
    url: string;
    name: string;
    mimeType: string;
    geminiFileUri?: string;
    geminiFileExpiry?: number;
}

export interface HistoryMessage {
    id: string;
    role: "user" | "model";
    text: string;
    attachments?: ChatAttachment[];
    /**
     * Per-message context items attached by the user (Layer 2).
     * Each item has `type` ('video-card' | 'suggested-traffic' | 'canvas-selection')
     * plus type-specific fields (title, ownership, nodes, sourceVideo, etc.).
     * Untyped on server because CF cannot import client-side AppContextItem types.
     */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    appContext?: any[];
}

export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cachedTokens?: number;
}

// MIRROR: src/core/types/sseEvents.ts:ToolCallRecord — keep in sync
export interface ToolCallRecord {
    name: string;
    args: Record<string, unknown>;
    result?: Record<string, unknown>;
}

// --- Gemini URI TTL ---

export function isGeminiUriValid(expiryMs?: number): boolean {
    if (!expiryMs) return false;
    return expiryMs > Date.now() + 5 * 60 * 1000;
}
