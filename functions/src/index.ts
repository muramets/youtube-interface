/**
 * index.ts — Cloud Functions entry point (thin re-exports only).
 *
 * Each function lives in its own module for single responsibility.
 * Firebase CLI discovers exports from this file automatically.
 */

// ─── Trends ────────────────────────────────────────────────────────────
export { scheduledTrendSnapshot } from "./trends/scheduledSync.js";
export { manualTrendSync } from "./trends/manualSync.js";

// ─── Video Render ──────────────────────────────────────────────────────
export { startRender } from "./render/startRender.js";
export { cancelRender } from "./render/cancelRender.js";
export { deleteRender } from "./render/deleteRender.js";

// ─── AI Chat ───────────────────────────────────────────────────────────
export { aiChat } from "./chat/aiChat.js";
export { geminiUpload } from "./chat/geminiUpload.js";
export { generateChatTitle } from "./chat/generateChatTitle.js";

// ─── Firestore Triggers ────────────────────────────────────────────────
export { onConversationDeleted } from "./triggers/onConversationDeleted.js";
export { onProjectDeleted } from "./triggers/onProjectDeleted.js";
