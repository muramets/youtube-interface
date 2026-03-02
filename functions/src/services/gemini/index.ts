// =============================================================================
// Gemini — barrel export
//
// All consumers import from this file. Internal structure is hidden.
// =============================================================================

// Client + shared types
export { getClient, isGeminiUriValid } from "./client.js";
export type {
    ChatAttachment,
    HistoryMessage,
    TokenUsage,
    ToolCallRecord,
} from "./client.js";

// File upload
export { uploadToGemini, reuploadFromStorage, uploadFromStoragePath } from "./fileUpload.js";

// Thumbnails
export type { ThumbnailCache, ThumbnailCacheEntry } from "./thumbnails.js";

// Stream chat (agentic loop)
export { streamChat, GeminiTimeoutError } from "./streamChat.js";
export type { StreamChatOpts } from "./streamChat.js";

// Title generation
export { generateTitle } from "./titleGeneration.js";

// Memory (re-export for backward compatibility)
export { buildMemory } from "../memory.js";
export type { MemoryResult } from "../memory.js";
