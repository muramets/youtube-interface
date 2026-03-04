// =============================================================================
// Gemini — barrel export
//
// All consumers import from this file. Internal structure is hidden.
// =============================================================================

// Client + Gemini-specific types
export { getClient, isGeminiUriValid } from "./client.js";
export type { ChatAttachment } from "./client.js";

// Provider-agnostic types (canonical source: ai/types.ts)
// Re-exported for backward compatibility of existing consumers.
// TODO: remove after all consumers migrated to import from '../ai/types.js'
export type { HistoryMessage, TokenUsage, ToolCallRecord } from "../ai/types.js";

// File upload
export { uploadToGemini, reuploadFromStorage, uploadFromStoragePath } from "./fileUpload.js";

// Thumbnails
export type { ThumbnailCache, ThumbnailCacheEntry } from "./thumbnails.js";

// Stream chat (agentic loop)
export { streamChat, GeminiTimeoutError } from "./streamChat.js";
export type { StreamChatOpts } from "./streamChat.js";

// Title generation
export { generateTitle } from "./titleGeneration.js";
